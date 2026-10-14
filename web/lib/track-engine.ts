// The engine every practice track runs on: it holds a track's state (in this browser's storage, so
// a reload resumes), signs the page-held members' calls, follows every transaction, and never
// sends a step it has not first looked for on the chain. A track (lib/practice.ts with
// lib/practice-engine.ts, lib/catch.ts with lib/catch-engine.ts) supplies its script: its steps,
// their order, how to look for each one, what each call is and what its result means. No React in
// here; a page reads the view through useSyncExternalStore and calls the functions returned.
//
// Every chain call goes through lib/chain.ts. Reads are few and paced by its cooldown: the result
// of a call comes from its own transaction (eth_getTransactionByHash, the 300 a minute bucket),
// and a view is only read to resume after a reload, to stamp the chain's clock once per spend,
// and to check that a step is not already there before sending it.

import {
  balanceOf,
  chainSeconds,
  contractAddress,
  faucet,
  invalidateReads,
  isAccepted,
  isMock,
  isSettled,
  keyAddress,
  newKey,
  readSpend,
  refusalReason,
  skipMockClock,
  txStatus,
  write,
  writeAs,
  type Call,
  type Stamped,
  type TxStatus,
} from "./chain";
import { notify, readItem, subscribe as subscribeStore } from "./browser-store";
import { plan, type ActionState, type TrackState } from "./track";
import { sentence } from "./words";

export type EngineView<S extends TrackState> = {
  state: S;
  /** the chain's clock, stamped by one view answer; null until a spend exists and was read */
  clock: Stamped | null;
  /** the latest status of each transaction being followed */
  live: Partial<Record<string, TxStatus>>;
  /** balances in atto of the addresses the track watches, "" until read */
  balances: Record<string, string>;
  /** another tab of this browser is running this track; this one only watches */
  watching: boolean;
  /** false on the server and until the browser's storage was read */
  loaded: boolean;
};

/** What a step left on the chain, when it is there; each track adds its own kinds. */
export type Found = { kind: string };

export type TrackSpec<S extends TrackState, F extends Found> = {
  /** the storage prefix and the lock name, e.g. "recused:practice" */
  key: string;
  keyNames: readonly string[];
  /** who signs each step: a page-held key's name, or "you" for the visitor's own wallet */
  signer: Record<string, string>;
  isFaucet: (id: string) => boolean;
  blank: (register: string) => S;
  parse: (raw: string, register: string) => S | null;
  started: (register: string, keys: Record<string, string>, addresses: Record<string, string>, nowMs: number) => S;
  /** the page-held steps that may be worked on now; `now` is chain seconds, 0 while unread */
  nextHeld: (s: S, now: number, nowMs: number) => string[];
  /** why a step may not be sent yet, or "" */
  blocked: (s: S, id: string, now: number) => string;
  /** looks for a step on the chain: null when it is not there; throws when the chain could not be read */
  look: (s: S, id: string, who: string) => Promise<F | null>;
  /** what a finished transaction did, when it did what was asked; null when the contract answered no */
  resultOf: (s: S, id: string, tx: TxStatus, who: string) => F | null;
  /** writes what a step left behind into the state */
  land: (s: S, id: string, f: F) => S;
  /** the chain clock a found step carries, if any */
  stamp?: (f: F) => Stamped | null;
  callFor: (s: S, id: string) => Promise<Call>;
  /** a refusal that passes by itself: the same call may simply be made again a little later */
  passing: RegExp;
  /** a step that is done without being sent (no time left for it), with the note to show */
  skipBeforeSend?: (s: S, id: string, now: number) => { found: F; note: string } | null;
  /** a step the contract refused that the track lands anyway, as skipped */
  landRefused?: (s: S, id: string) => F | null;
  /** the spend whose view stamps the chain's clock */
  clockSpend: (s: S) => { desk: string; n: number } | null;
  /** addresses whose balance the page shows after a payment, watched until they hold at least so much */
  watches: (s: S) => { key: string; address: string; atLeast: bigint }[];
  /** the visitor's own steps to follow across a reload, or to look for once */
  resumeVisitor: (s: S, visitor: string) => string[];
  /** the moments a demo-mode skip may jump to (notice ends, hold ends) */
  deadlines: (s: S) => number[];
  /** runs just before a visitor's step is sent; what it returns is merged into the state */
  beforeVisitorSend?: (s: S, id: string, who: string) => Promise<Partial<S> | null>;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** The in-memory contract answers at once; the chain is polled every three seconds (the eth_* bucket). */
const POLL_MS = isMock ? 500 : 3000;
/** A transaction is followed this long before the page says it is taking unusually long. It is never sent again meanwhile. */
const FOLLOW_MAX_MS = 8 * 60_000;
/** Pause between two looks at the chain while a call that may have left the browser is waited for. */
const LOOK_EVERY_MS = isMock ? 500 : 9000;
/** Pause before a call the contract turned away for a reason that passes (a split round, a clock a second early) is sent again. */
const AGAIN_MS = isMock ? 500 : 12_000;
const MAX_TRIES = 3;
/** Pause before a step whose chain read failed (rate limit, a dropped request) is looked at again. */
const READ_AGAIN_MS = isMock ? 500 : 20_000;
/**
 * How long a watched balance is read after the paying transaction. The transfer leaves at
 * FINALIZED, usually half a minute after ACCEPTED, and a busy network can take several minutes.
 */
const BALANCE_WATCH_MS = 10 * 60_000;

/** A page that is going away: shared by every track, since it is one page at a time. */
let leavingAt = 0;
/** True for a few seconds after the page began to unload (a page that is still here after that did not leave). */
const leaving = (): boolean => leavingAt > 0 && Date.now() - leavingAt < 5000;
let listening = false;
function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const go = () => {
    leavingAt = Date.now();
  };
  window.addEventListener("beforeunload", go);
  window.addEventListener("pagehide", go);
  window.addEventListener("pageshow", () => {
    leavingAt = 0;
  });
}

const errorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "You cancelled the signature in the wallet. Nothing was sent.";
  if (/insufficient funds/i.test(msg)) return "Your wallet does not hold enough test GEN for this. The wallet menu at the top right gets 10 test GEN from the faucet.";
  const expected = /\[EXPECTED\]\s*([^"}\n]+)/.exec(msg);
  if (expected) return sentence(expected[1]);
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
};

export type Engine<S extends TrackState> = {
  subscribe: (cb: () => void) => () => void;
  snapshot: () => EngineView<S>;
  serverSnapshot: () => EngineView<S>;
  attach: () => () => void;
  setVisitor: (address: string) => void;
  start: () => void;
  /** sends one of the visitor's own steps with their wallet, after looking for it on the chain */
  visitor: (id: string, call: Call) => void;
  /** changes the state by the visitor's choice (no chain call), then moves on */
  update: (fn: (s: S) => S) => void;
  retry: (id: string) => void;
  reset: () => void;
  skipWait: () => void;
  isRunning: (id: string) => boolean;
};

export function createEngine<S extends TrackState, F extends Found>(spec: TrackSpec<S, F>): Engine<S> {
  const BLANK: EngineView<S> = { state: spec.blank(""), clock: null, live: {}, balances: {}, watching: false, loaded: false };

  let view: EngineView<S> = BLANK;
  /** The register the view in memory belongs to; null until the first read in the browser. */
  let loadedFor: string | null = null;
  let lastRaw = "";
  /** Bumped by reset and by a change of register: every flow in flight then stops touching the state. */
  let epoch = 0;
  /** driver: this tab runs the engine. watcher: another tab does. */
  let role: "unknown" | "driver" | "watcher" = "unknown";

  const registerNow = (): string => (isMock ? "mock" : contractAddress().toLowerCase());
  const storageKey = (register: string) => `${spec.key}:${register}`;

  function load(): void {
    const register = registerNow();
    if (loadedFor === register) {
      // A watching tab follows what the driving tab stores.
      if (role === "watcher" && !isMock) {
        const raw = readItem(storageKey(register));
        if (raw !== lastRaw) {
          lastRaw = raw;
          view = { ...view, state: spec.parse(raw, register) ?? spec.blank(register) };
        }
      }
      return;
    }
    if (loadedFor !== null) epoch++;
    loadedFor = register;
    // Demo mode keeps nothing: the in-memory contract starts again on a reload, and so does this.
    lastRaw = isMock || !register ? "" : readItem(storageKey(register));
    view = { ...BLANK, state: spec.parse(lastRaw, register) ?? spec.blank(register), watching: view.watching, loaded: true };
  }

  function store(next: EngineView<S>, persist: boolean): void {
    view = next;
    if (persist && !isMock && loadedFor) {
      lastRaw = JSON.stringify(next.state);
      try {
        localStorage.setItem(storageKey(loadedFor), lastRaw);
      } catch {
        /* storage blocked: the practice desk then lasts for this page only */
      }
    }
    notify();
  }

  const setState = (fn: (s: S) => S) => store({ ...view, state: fn(view.state) }, true);
  const setView = (p: Partial<Omit<EngineView<S>, "state">>) => store({ ...view, ...p }, false);
  const patch = (id: string, p: Partial<ActionState>) =>
    setState((s) => ({ ...s, actions: { ...s.actions, [id]: { ...s.actions[id], ...p } } }));
  const action = (id: string): ActionState => view.state.actions[id];

  // ---- one tab drives ---------------------------------------------------------------------

  let claimedAt = 0;
  function claim(): void {
    if (role === "driver" || Date.now() - claimedAt < 5000) return;
    claimedAt = Date.now();
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (isMock || !locks?.request) {
      role = "driver";
      return;
    }
    if (role === "unknown") role = "watcher";
    void locks
      .request(spec.key, { ifAvailable: true }, (lock) => {
        if (!lock) {
          if (!view.watching) setView({ watching: true });
          return;
        }
        role = "driver";
        // What another tab stored while it was driving is the state to go on from.
        loadedFor = null;
        load();
        setView({ watching: false });
        // Held for as long as this tab lives.
        return new Promise<void>(() => {});
      })
      .catch(() => {
        role = "driver";
      });
  }

  // ---- sending and following ------------------------------------------------------------------

  /** The connected wallet, as the page last reported it. */
  let visitor = "";
  const signerAddress = (id: string): string => {
    const who = spec.signer[id];
    return who === "you" ? view.state.visitor || visitor : view.state.addresses[who];
  };

  function land(id: string, f: F, how: Partial<ActionState>): void {
    setState((s) => {
      const marked = { ...s, actions: { ...s.actions, [id]: { ...s.actions[id], phase: "done" as const, markedAt: 0, note: "", notBefore: 0, ...how } } };
      return spec.land(marked, id, f);
    });
    const stamp = spec.stamp?.(f);
    if (stamp && stamp.chainNow > 0) setView({ clock: stamp });
  }

  /** Polls a transaction until the network has accepted it (or settled it some other way). null: gave up waiting. */
  async function follow(id: string, hash: string, alive: () => boolean): Promise<TxStatus | null> {
    const started = Date.now();
    while (alive()) {
      try {
        const s = await txStatus(hash);
        if (!alive()) return null;
        const before = view.live[id];
        if (!before || before.status !== s.status || before.votes.agree !== s.votes.agree || before.votes.disagree !== s.votes.disagree)
          setView({ live: { ...view.live, [id]: s } });
        if (isAccepted(s) || isSettled(s)) return s;
      } catch {
        /* a dropped poll is not a failed transaction; the next one may answer */
      }
      if (Date.now() - started > FOLLOW_MAX_MS) return null;
      await sleep(POLL_MS);
    }
    return null;
  }

  /** The chain's clock in seconds; 0 until a view has stamped it, so nothing is timed on a guess. */
  const chainNow = (): number => (view.clock ? chainSeconds(view.clock) : 0);

  /** The lanes: one call at a time per signer, so no two calls of one account race for a nonce. */
  const running = new Set<string>();
  const laneBusy = (id: string): boolean => Array.from(running).some((r) => spec.signer[r] === spec.signer[id]);

  async function perform(id: string, alive: () => boolean, visitorCall?: Call): Promise<void> {
    const mine = spec.signer[id];
    const who = signerAddress(id);

    if (spec.isFaucet(id)) {
      patch(id, { phase: "checking", note: "" });
      const funded = (await balanceOf(who)) > 0n;
      if (!alive()) return;
      if (funded) return land(id, { kind: "funded" } as F, { found: true });
      patch(id, { phase: "signing" });
      await faucet(who);
      if (alive()) land(id, { kind: "funded" } as F, {});
      return;
    }

    if (!action(id).hash) {
      const skip = spec.skipBeforeSend?.(view.state, id, chainNow());
      if (skip) return land(id, skip.found, { skipped: true, note: skip.note });
    }

    let hash = action(id).hash;
    if (!hash) {
      // Nothing is sent before the chain has been read for it.
      patch(id, { phase: "checking" });
      let found = await spec.look(view.state, id, who);
      while (!found && alive() && plan(action(id), Date.now()) === "wait") {
        await sleep(LOOK_EVERY_MS);
        found = await spec.look(view.state, id, who);
      }
      if (!alive()) return;
      if (found) return land(id, found, { found: true });
      // The mark has done its work: the chain was read for as long as a lost call could take to land.
      if (mine === "you" && !visitorCall) return patch(id, { phase: "waiting", markedAt: 0 });
      const why = spec.blocked(view.state, id, chainNow());
      if (why) return patch(id, { phase: "waiting", markedAt: 0, note: mine === "you" ? why.charAt(0).toUpperCase() + why.slice(1) + "." : "" });

      const call = visitorCall ?? (await spec.callFor(view.state, id));
      if (!alive()) return;
      if (mine === "you" && spec.beforeVisitorSend) {
        const extra = await spec.beforeVisitorSend(view.state, id, who);
        if (!alive()) return;
        if (extra) setState((s) => ({ ...s, ...extra }));
      }
      patch(id, { phase: "signing", markedAt: Date.now(), note: "" });
      try {
        hash = mine === "you" ? await write(call) : await writeAs(view.state.keys[mine], call);
      } catch (e) {
        if (!alive() || leaving()) return;
        // A wallet that said no sent nothing. A page-held call may have left before the error: its mark stays.
        if (mine === "you") return patch(id, { phase: "waiting", markedAt: 0, note: errorText(e) });
        return patch(id, { phase: "stopped", note: errorText(e) });
      }
      if (!alive()) return;
      patch(id, { hash, phase: "onchain", markedAt: 0 });
    } else {
      patch(id, { phase: "onchain" });
    }

    const s = await follow(id, hash, alive);
    if (!alive()) return;
    if (!s) {
      return patch(id, {
        phase: "stopped",
        note: "The network has not decided this transaction after eight minutes. It is not sent again; press Check again to keep following it.",
      });
    }
    invalidateReads();

    const tries = action(id).tries + 1;
    const again = (note: string) =>
      patch(
        id,
        tries >= MAX_TRIES && mine !== "you"
          ? { phase: "refused", hash: "", last: hash, note }
          : { phase: "waiting", hash: "", last: hash, tries, note, notBefore: Date.now() + AGAIN_MS },
      );

    if (s.undetermined || s.status === "CANCELED" || s.applied === false) {
      return again(
        s.status === "CANCELED"
          ? "The network cancelled the transaction, so nothing was stored."
          : "The validators did not agree, so nothing was stored and nothing was spent. The same call is safe to make again.",
      );
    }
    const result = spec.resultOf(view.state, id, s, who);
    if (result) return land(id, result, { hash });

    // The contract answered no. If the step is on the chain after all (a call made twice), that is the answer.
    const reason = sentence(refusalReason(s)) || "The contract refused this call.";
    try {
      const found = await spec.look(view.state, id, who);
      if (!alive()) return;
      if (found) return land(id, found, { found: true, hash: "", last: hash });
    } catch {
      /* the refusal stands as what is known */
    }
    const anyway = spec.landRefused?.(view.state, id);
    if (anyway) return land(id, anyway, { skipped: true, hash: "", last: hash, note: reason });
    if (spec.passing.test(refusalReason(s))) return again(reason);
    // The visitor may sign again; the page's own members stop here.
    patch(id, { phase: mine === "you" ? "waiting" : "refused", hash: "", last: hash, note: reason });
  }

  async function run(id: string, visitorCall?: Call): Promise<void> {
    if (running.has(id)) return;
    running.add(id);
    const mine = epoch;
    const alive = () => mine === epoch;
    try {
      await perform(id, alive, visitorCall);
    } catch (e) {
      if (alive() && !leaving()) {
        const a = action(id);
        const note = errorText(e);
        if (spec.signer[id] === "you" && !a.hash) patch(id, { phase: "waiting", note });
        // A read that failed says nothing about the chain: the page's own steps try again by themselves a few times.
        else if (a.tries + 1 < MAX_TRIES) patch(id, { phase: "waiting", tries: a.tries + 1, notBefore: Date.now() + READ_AGAIN_MS, note });
        else patch(id, { phase: "stopped", note });
      }
    } finally {
      running.delete(id);
      if (alive()) tick();
    }
  }

  // ---- the clock, the balances, and the visitor ---------------------------------------------------

  let clockAskedAt = 0;
  async function stampClock(): Promise<void> {
    const at = spec.clockSpend(view.state);
    if (!at || view.clock || Date.now() - clockAskedAt < 15_000) return;
    clockAskedAt = Date.now();
    const mine = epoch;
    try {
      const sp = (await readSpend(at.desk, at.n, { fresh: true })).data;
      if (mine === epoch && sp && sp.chainNow > 0) setView({ clock: { chainNow: sp.chainNow, readAtMs: sp.readAtMs } });
    } catch {
      /* asked again in a quarter of a minute */
    }
  }

  const watching = new Set<string>();
  /** Reads a balance until it holds what was paid, or the watch runs out. */
  async function watchBalance(key: string, address: string, atLeast: bigint): Promise<void> {
    if (watching.has(key)) return;
    watching.add(key);
    const mine = epoch;
    const until = Date.now() + BALANCE_WATCH_MS;
    try {
      while (mine === epoch) {
        try {
          const b = await balanceOf(address);
          if (mine !== epoch) return;
          if (view.balances[key] !== b.toString()) setView({ balances: { ...view.balances, [key]: b.toString() } });
          if (b >= atLeast) return;
        } catch {
          /* a dropped balance read is not news */
        }
        if (Date.now() > until) return;
        await sleep(isMock ? 500 : 3000);
      }
    } finally {
      watching.delete(key);
    }
  }

  /** Steps of the visitor's own that were looked for on the chain already, per address. */
  const looked = new Set<string>();

  function tick(): void {
    if (leaving()) return;
    load();
    if (role !== "driver") claim();
    const s = view.state;
    if (role !== "driver" || !s.startedAt) return;
    void stampClock();
    // Each watch runs once from its first read; a balance that never arrives is not read for ever.
    for (const w of spec.watches(s)) if (!view.balances[w.key]) void watchBalance(w.key, w.address, w.atLeast);
    const now = view.clock ? chainSeconds(view.clock) : 0;
    for (const id of spec.nextHeld(s, now, Date.now())) {
      if (running.has(id) || laneBusy(id)) continue;
      void run(id);
    }
    // The visitor's own steps: follow a transaction of theirs across a reload, and look once for a
    // step they may have made elsewhere (the spend's own page), so it is never asked for twice.
    const who = s.visitor || visitor;
    for (const id of spec.resumeVisitor(s, who)) {
      const a = s.actions[id];
      if (a.phase === "done" || a.phase === "refused" || a.phase === "stopped" || running.has(id)) continue;
      if (!who || !s.desk) continue;
      const key = `${id}|${who}|${s.desk}`;
      if (a.hash || a.markedAt || !looked.has(key)) {
        looked.add(key);
        void run(id);
      }
    }
  }

  // ---- what the page calls ---------------------------------------------------------------------------

  let timer: ReturnType<typeof setInterval> | null = null;
  let attached = 0;

  return {
    subscribe: (cb) => subscribeStore(cb),
    snapshot: () => {
      load();
      return view;
    },
    serverSnapshot: () => BLANK,
    /** Called while the page is on screen: resumes whatever is unfinished and keeps the clock-gated steps moving. */
    attach: () => {
      attached++;
      listen();
      claim();
      if (!timer) timer = setInterval(tick, 1000);
      tick();
      return () => {
        attached--;
        if (attached <= 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    setVisitor: (address) => {
      visitor = address.toLowerCase();
      if (view.loaded) tick();
    },
    /** Makes the keys and begins. One click; everything up to the visitor's own first step then runs by itself. */
    start: () => {
      load();
      if (role !== "driver" || view.state.startedAt || !loadedFor) return;
      const keys: Record<string, string> = {};
      const addresses: Record<string, string> = {};
      for (const k of spec.keyNames) {
        keys[k] = newKey();
        addresses[k] = keyAddress(keys[k]);
      }
      store({ ...view, clock: null, live: {}, balances: {}, state: spec.started(loadedFor, keys, addresses, Date.now()) }, true);
      tick();
    },
    visitor: (id, call) => {
      const s = view.state;
      if (!s.desk || !visitor || running.has(id)) return;
      if (s.visitor && s.visitor !== visitor) return;
      void run(id, call);
    },
    update: (fn) => {
      setState(fn);
      tick();
    },
    /** Tries a step again after it stopped or was refused. It is looked for on the chain first, as always. */
    retry: (id) => {
      const live = view.live[id];
      // A transaction the network never listed is given up; one it knows is followed again, never resent.
      const lost = !!action(id).hash && (!live || live.status === "UNKNOWN");
      patch(id, { phase: "waiting", note: "", tries: 0, notBefore: 0, ...(lost ? { hash: "", last: action(id).hash, markedAt: Date.now() - 30_000 } : {}) });
      tick();
    },
    /** Forgets this track's desk (the keys with it) so a new one can be started. Nothing on chain is undone. */
    reset: () => {
      load();
      epoch++;
      running.clear();
      looked.clear();
      watching.clear();
      clockAskedAt = 0;
      if (!isMock && loadedFor) {
        try {
          localStorage.removeItem(storageKey(loadedFor));
        } catch {
          /* nothing was stored */
        }
      }
      lastRaw = "";
      store({ ...BLANK, state: spec.blank(loadedFor ?? ""), watching: view.watching, loaded: true }, false);
    },
    /** Demo mode only: moves the in-memory contract's clock past the next window that is running. */
    skipWait: () => {
      if (!isMock || !view.clock) return;
      const now = chainSeconds(view.clock);
      const until = spec.deadlines(view.state).filter((u) => u > now).sort((a, b) => a - b)[0];
      if (!until) return;
      skipMockClock(until - now + 5);
      clockAskedAt = 0;
      store({ ...view, clock: null }, false);
      tick();
    },
    isRunning: (id) => running.has(id),
  };
}
