// The practice desk's engine: it holds the state (in this browser's storage, so a reload
// resumes), signs the page-held members' calls, follows every transaction, and never sends a
// step it has not first looked for on the chain. No React in here; app/practice/page.tsx reads
// the view through useSyncExternalStore and calls the few functions at the bottom.
//
// Every chain call goes through lib/chain.ts. Reads are few and paced by its cooldown: the
// result of a call comes from its own transaction (eth_getTransactionByHash, the 300 a minute
// bucket), and a view is only read to resume after a reload, to stamp the chain's clock once
// per spend, and to check that a step is not already there before sending it.

import {
  LIMITS,
  approveOutcome,
  balanceOf,
  calls,
  chainSeconds,
  contractAddress,
  faucet,
  filedDisclosure,
  identified,
  invalidateReads,
  isAccepted,
  isMock,
  isSettled,
  keyAddress,
  newKey,
  openedDesk,
  postedSpend,
  readDesk,
  readDesks,
  readIdents,
  readLimits,
  readMember,
  readReading,
  readSpend,
  readSpends,
  refusalReason,
  skipMockClock,
  txStatus,
  write,
  writeAs,
  type Call,
  type EntryInput,
  type Reading,
  type Stamped,
  type TxStatus,
} from "./chain";
import { notify, readItem, subscribe as subscribeStore } from "./browser-store";
import {
  ACTIONS,
  CAST,
  KEY_NAMES,
  LIVE_MINUTES,
  POT_ATTO,
  PRACTICE_KEY,
  SIGNER,
  SPEND1,
  SPEND2,
  blankState,
  blocked,
  identification,
  identifyTooLate,
  isFaucet,
  isVisitorAction,
  nextHeld,
  parseState,
  plan,
  startedState,
  type ActionId,
  type ActionState,
  type KeyName,
  type MemberInfo,
  type PracticeState,
  type ReadingSlot,
  type Role,
  type SpendInfo,
} from "./practice";
import { sentence } from "./words";

export type PracticeView = {
  state: PracticeState;
  /** the chain's clock, stamped by one view answer; null until a spend exists and was read */
  clock: Stamped | null;
  /** the latest status of each transaction being followed */
  live: Partial<Record<ActionId, TxStatus>>;
  /** balances in atto of the two payee addresses, "" until read */
  balances: { locksmith: string; till: string };
  /** another tab of this browser is running the practice desk; this one only watches */
  watching: boolean;
  /** false on the server and until the browser's storage was read */
  loaded: boolean;
};

const NO_BALANCES = { locksmith: "", till: "" };
const BLANK: PracticeView = { state: blankState(""), clock: null, live: {}, balances: NO_BALANCES, watching: false, loaded: false };

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
 * How long the payee's balance is watched after the paying transaction. The transfer leaves at
 * FINALIZED, usually half a minute after ACCEPTED, and a busy network can take several minutes.
 */
const BALANCE_WATCH_MS = 10 * 60_000;

// ---- the store ------------------------------------------------------------------------------

let view: PracticeView = BLANK;
/** The register the view in memory belongs to; null until the first read in the browser. */
let loadedFor: string | null = null;
let lastRaw = "";
/** Bumped by reset and by a change of register: every flow in flight then stops touching the state. */
let epoch = 0;
/** driver: this tab runs the engine. watcher: another tab does. */
let role: "unknown" | "driver" | "watcher" = "unknown";

const registerNow = (): string => (isMock ? "mock" : contractAddress().toLowerCase());
const storageKey = (register: string) => `${PRACTICE_KEY}:${register}`;

function load(): void {
  const register = registerNow();
  if (loadedFor === register) {
    // A watching tab follows what the driving tab stores.
    if (role === "watcher" && !isMock) {
      const raw = readItem(storageKey(register));
      if (raw !== lastRaw) {
        lastRaw = raw;
        view = { ...view, state: parseState(raw, register) ?? blankState(register) };
      }
    }
    return;
  }
  if (loadedFor !== null) epoch++;
  loadedFor = register;
  // Demo mode keeps nothing: the in-memory contract starts again on a reload, and so does this.
  lastRaw = isMock || !register ? "" : readItem(storageKey(register));
  view = { ...BLANK, state: parseState(lastRaw, register) ?? blankState(register), watching: view.watching, loaded: true };
}

function store(next: PracticeView, persist: boolean): void {
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

const setState = (fn: (s: PracticeState) => PracticeState) => store({ ...view, state: fn(view.state) }, true);
const setView = (patch: Partial<Omit<PracticeView, "state">>) => store({ ...view, ...patch }, false);
const patch = (id: ActionId, p: Partial<ActionState>) =>
  setState((s) => ({ ...s, actions: { ...s.actions, [id]: { ...s.actions[id], ...p } } }));
const action = (id: ActionId): ActionState => view.state.actions[id];

export const subscribe = (cb: () => void): (() => void) => subscribeStore(cb);
export function snapshot(): PracticeView {
  load();
  return view;
}
export const serverSnapshot = (): PracticeView => BLANK;

// ---- a page that is going away -----------------------------------------------------------------
// A reload or a closed tab cancels every request in flight, and each one then fails. Those
// failures say nothing about the chain, so nothing that fails while the page is leaving is
// written into the stored state: the next page reads the chain and carries on. A transaction
// hash that arrives in that moment is still kept, because it is worth having.

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

// ---- one tab drives --------------------------------------------------------------------------

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
    .request("recused:practice", { ifAvailable: true }, (lock) => {
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

// ---- reading the chain ------------------------------------------------------------------------

const role2reading: Partial<Record<ActionId, ReadingSlot>> = { signYou: "you", signPrinter: "printer", signNurse: "nurse", sign2: "contrast" };
const role2member: Partial<Record<ActionId, Role | "you">> = { enrolTeacher: "teacher", enrolPrinter: "printer", enrolNurse: "nurse", enrolYou: "you" };

/** The connected wallet, as the page last reported it. */
let visitor = "";

const signerAddress = (id: ActionId): string => {
  const who = SIGNER[id];
  return who === "you" ? view.state.visitor || visitor : view.state.addresses[who];
};

/** What a step left on the chain, when it is there. */
type Found =
  | { kind: "desk"; desk: string }
  | { kind: "member"; member: MemberInfo; who: string }
  | { kind: "spend"; spend: SpendInfo; clock: Stamped }
  | { kind: "ident" }
  | { kind: "reading"; reading: Reading; paid: PracticeState["paid"] }
  | { kind: "funded" };

/** Looks for a step on the chain. null: it is not there. Throws when the chain could not be read. */
async function look(id: ActionId): Promise<Found | null> {
  const s = view.state;
  const fresh = { fresh: true };
  if (isFaucet(id)) return (await balanceOf(signerAddress(id))) > 0n ? { kind: "funded" } : null;
  if (id === "open") {
    const rows = (await readDesks(undefined, fresh)).data.rows.filter((d) => d.label === s.label);
    for (const row of rows) {
      const d = (await readDesk(row.id, fresh)).data;
      if (d && d.opener === s.addresses.teacher) return { kind: "desk", desk: d.id };
    }
    return null;
  }
  if (!s.desk) return null;
  if (role2member[id]) {
    const who = signerAddress(id);
    if (!who) return null;
    const m = (await readMember(s.desk, who, fresh)).data;
    return m ? { kind: "member", member: { number: m.number, filedSeq: m.filedSeq }, who } : null;
  }
  if (id === "post1" || id === "post2") {
    const payee = s.addresses[id === "post1" ? SPEND1.payee : SPEND2.payee];
    const row = (await readSpends(s.desk, fresh)).data.rows.find((r) => r.payee === payee);
    if (!row) return null;
    const sp = (await readSpend(s.desk, row.n, fresh)).data;
    if (!sp) return null;
    return {
      kind: "spend",
      spend: { n: sp.n, noticeUntil: sp.noticeUntil, windowUntil: sp.windowUntil, postedSeq: sp.postedSeq },
      clock: { chainNow: sp.chainNow, readAtMs: sp.readAtMs },
    };
  }
  if (id === "identify2") {
    if (!s.s2) return null;
    const list = (await readIdents(s.desk, s.s2.n, fresh)).data;
    return list.some((i) => i.by === s.addresses.nurse) ? { kind: "ident" } : null;
  }
  const slot = role2reading[id];
  if (slot) {
    const spend = id === "sign2" ? s.s2 : s.s1;
    const who = signerAddress(id);
    if (!spend || !who) return null;
    const reading = (await readReading(s.desk, spend.n, who, fresh)).data;
    if (!reading) return null;
    let paid: PracticeState["paid"] = null;
    if (id !== "sign2" && reading.verdict === "clear") {
      const sp = (await readSpend(s.desk, spend.n, fresh)).data;
      if (sp && sp.state === "paid" && sp.approver2 === who) paid = { atto: sp.amountAtto, to: sp.payee, by: slot, potAtto: "" };
    }
    return { kind: "reading", reading, paid };
  }
  return null;
}

/** Writes what a step left behind into the state and marks it done. */
function land(id: ActionId, f: Found, how: Partial<ActionState>): void {
  setState((s) => {
    const next: PracticeState = { ...s, actions: { ...s.actions, [id]: { ...s.actions[id], phase: "done", markedAt: 0, note: "", notBefore: 0, ...how } } };
    if (f.kind === "desk") next.desk = f.desk;
    if (f.kind === "member") {
      const who = role2member[id]!;
      next.members = { ...s.members, [who]: f.member };
      if (who === "you") next.visitor = f.who;
    }
    if (f.kind === "spend") {
      if (id === "post1") next.s1 = f.spend;
      else next.s2 = f.spend;
    }
    if (f.kind === "reading") {
      next.readings = { ...s.readings, [role2reading[id]!]: f.reading };
      if (f.paid) next.paid = f.paid;
    }
    return next;
  });
  if (f.kind === "spend" && f.clock.chainNow > 0) setView({ clock: f.clock });
}

/** What a finished transaction did, when it did what was asked; null when the contract answered no. */
function resultOf(id: ActionId, s: TxStatus, who: string): Found | null {
  if (s.exec === "ERROR") return null;
  if (id === "open") {
    const d = openedDesk(s);
    return d ? { kind: "desk", desk: d.desk } : null;
  }
  if (role2member[id]) {
    const m = filedDisclosure(s);
    return m ? { kind: "member", member: { number: m.member, filedSeq: m.filedSeq }, who } : null;
  }
  if (id === "post1" || id === "post2") {
    const p = postedSpend(s);
    // The clock is stamped by a view afterwards; the transaction only says when the windows end.
    return p ? { kind: "spend", spend: { n: p.n, noticeUntil: p.noticeUntil, windowUntil: p.windowUntil, postedSeq: p.postedSeq }, clock: { chainNow: 0, readAtMs: 0 } } : null;
  }
  if (id === "identify2") return identified(s) ? { kind: "ident" } : null;
  const slot = role2reading[id];
  if (slot) {
    const o = approveOutcome(s);
    if (o.kind === "paid") return { kind: "reading", reading: o.reading, paid: { atto: o.paidAtto, to: o.to, by: slot, potAtto: o.potAtto } };
    if (o.kind === "counted" || o.kind === "recused") return { kind: "reading", reading: o.reading, paid: null };
  }
  return null;
}

// ---- sending and following ------------------------------------------------------------------------

const errorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "You cancelled the signature in the wallet. Nothing was sent.";
  const expected = /\[EXPECTED\]\s*([^"}\n]+)/.exec(msg);
  if (expected) return sentence(expected[1]);
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg;
};

/** A refusal that passes by itself: the same call may simply be made again a little later. */
const PASSING = /notice window of S\d+ runs to|a model could not be reached|no node could reach a model|no readable clock|no desk D\d+$|no spend S\d+ on|only a member of|has \d members and a spend needs/i;

let limitsRead: { noticeMinutes: number; windowMinutes: number } | null = null;
async function windows(): Promise<{ noticeMinutes: number; windowMinutes: number }> {
  if (limitsRead) return limitsRead;
  let l = LIMITS;
  try {
    l = (await readLimits()).data;
  } catch {
    /* the limits written into the site stand in; the contract refuses a window it does not take */
  }
  const notice = l.noticeMinutes[0];
  limitsRead = { noticeMinutes: notice, windowMinutes: Math.min(l.windowMinutes, notice + Math.max(LIVE_MINUTES, l.liveMinutes)) };
  return limitsRead;
}

async function callFor(id: ActionId): Promise<Call> {
  const s = view.state;
  const member = role2member[id];
  // The desk's own minimum notice is the shortest the contract takes, so the practice spends may use it.
  if (id === "open") return calls.openDesk(s.label, [], POT_ATTO, (await windows()).noticeMinutes);
  if (member && member !== "you") return calls.enrol(s.desk, CAST[member].statement, CAST[member].entries, []);
  if (id === "post1" || id === "post2") {
    const sp = id === "post1" ? SPEND1 : SPEND2;
    const w = await windows();
    return calls.postSpend(s.desk, s.addresses[sp.payee], sp.amountAtto, sp.description, w.noticeMinutes, w.windowMinutes);
  }
  if (id === "identify2") return calls.identify(s.desk, s.s2!.n, identification(s.members.printer?.number ?? ""));
  if (id === "sign2") return calls.approve(s.desk, s.s2!.n);
  if (id === "signYou" || id === "signPrinter" || id === "signNurse") return calls.approve(s.desk, s.s1!.n);
  throw new Error("no call for " + id);
}

/** Polls a transaction until the network has accepted it (or settled it some other way). null: gave up waiting. */
async function follow(id: ActionId, hash: string, alive: () => boolean): Promise<TxStatus | null> {
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
const running = new Set<ActionId>();
const laneBusy = (id: ActionId): boolean => Array.from(running).some((r) => SIGNER[r] === SIGNER[id]);

async function perform(id: ActionId, alive: () => boolean, visitorCall?: Call): Promise<void> {
  const mine = SIGNER[id];
  const who = signerAddress(id);

  if (isFaucet(id)) {
    patch(id, { phase: "checking", note: "" });
    const funded = await look(id);
    if (!alive()) return;
    if (funded) return land(id, { kind: "funded" }, { found: true });
    patch(id, { phase: "signing" });
    await faucet(who);
    if (alive()) land(id, { kind: "funded" }, {});
    return;
  }

  if (id === "identify2" && !action(id).hash && identifyTooLate(view.state, chainNow())) {
    return land(id, { kind: "ident" }, { skipped: true, note: "The notice window had too little left for an identification to land in it, so none was sent." });
  }

  let hash = action(id).hash;
  if (!hash) {
    // Nothing is sent before the chain has been read for it.
    patch(id, { phase: "checking" });
    let found = await look(id);
    while (!found && alive() && plan(action(id), Date.now()) === "wait") {
      await sleep(LOOK_EVERY_MS);
      found = await look(id);
    }
    if (!alive()) return;
    if (found) return land(id, found, { found: true });
    // The mark has done its work: the chain was read for as long as a lost call could take to land.
    if (mine === "you" && !visitorCall) return patch(id, { phase: "waiting", markedAt: 0 });
    const why = blocked(view.state, id, chainNow());
    if (why) return patch(id, { phase: "waiting", markedAt: 0, note: mine === "you" ? why.charAt(0).toUpperCase() + why.slice(1) + "." : "" });

    const call = visitorCall ?? (await callFor(id));
    if (!alive()) return;
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
        : "The validators split, so nothing was stored and no attempt was spent. The same call is safe to make again.",
    );
  }
  const result = resultOf(id, s, who);
  if (result) return land(id, result, { hash });

  // The contract answered no. If the step is on the chain after all (a call made twice), that is the answer.
  const reason = sentence(refusalReason(s)) || "The contract refused this call.";
  try {
    const found = await look(id);
    if (!alive()) return;
    if (found) return land(id, found, { found: true, hash: "", last: hash });
  } catch {
    /* the refusal stands as what is known */
  }
  if (id === "identify2") return land(id, { kind: "ident" }, { skipped: true, hash: "", last: hash, note: reason });
  if (PASSING.test(refusalReason(s))) return again(reason);
  // The visitor may sign again (a disclosure the contract turned away can be rewritten); the page's own members stop here.
  patch(id, { phase: mine === "you" ? "waiting" : "refused", hash: "", last: hash, note: reason });
}

async function run(id: ActionId, visitorCall?: Call): Promise<void> {
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
      if (isVisitorAction(id) && !a.hash) patch(id, { phase: "waiting", note });
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
  const s = view.state;
  const spend = s.s2 ?? s.s1;
  if (!s.desk || !spend || view.clock || Date.now() - clockAskedAt < 15_000) return;
  clockAskedAt = Date.now();
  const mine = epoch;
  try {
    const sp = (await readSpend(s.desk, spend.n, { fresh: true })).data;
    if (mine === epoch && sp && sp.chainNow > 0) setView({ clock: { chainNow: sp.chainNow, readAtMs: sp.readAtMs } });
  } catch {
    /* asked again in a quarter of a minute */
  }
}

const watching = new Set<string>();
/** Reads a payee's balance until it holds what the spend paid, or the watch runs out. */
async function watchBalance(which: "locksmith" | "till", atLeast: bigint): Promise<void> {
  if (watching.has(which)) return;
  watching.add(which);
  const mine = epoch;
  const until = Date.now() + BALANCE_WATCH_MS;
  try {
    while (mine === epoch) {
      try {
        const b = await balanceOf(view.state.addresses[which]);
        if (mine !== epoch) return;
        if (view.balances[which] !== b.toString()) setView({ balances: { ...view.balances, [which]: b.toString() } });
        if (b >= atLeast) return;
      } catch {
        /* a dropped balance read is not news */
      }
      if (Date.now() > until) return;
      await sleep(isMock ? 500 : 3000);
    }
  } finally {
    watching.delete(which);
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
  if (s.paid && view.balances.locksmith === "") void watchBalance("locksmith", BigInt(s.paid.atto || "0"));
  const now = view.clock ? chainSeconds(view.clock) : 0;
  for (const id of nextHeld(s, now, Date.now())) {
    if (running.has(id) || laneBusy(id)) continue;
    void run(id);
  }
  // The visitor's own steps: follow a transaction of theirs across a reload, and look once for a
  // step they may have made elsewhere (the spend's own page), so it is never asked for twice.
  for (const id of ["enrolYou", "signYou"] as ActionId[]) {
    const a = s.actions[id];
    if (a.phase === "done" || a.phase === "refused" || a.phase === "stopped" || running.has(id)) continue;
    const who = s.visitor || visitor;
    if (!who || !s.desk) continue;
    if (id === "enrolYou" && s.s1) continue;
    if (id === "signYou" && (!s.s1 || !s.members.you)) continue;
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

/** Called while the page is on screen: resumes whatever is unfinished and keeps the clock-gated steps moving. */
export function attach(): () => void {
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
}

/** The address of the connected wallet ("" when none). */
export function setVisitor(address: string): void {
  visitor = address.toLowerCase();
  if (view.loaded) tick();
}

/** Makes the keys and begins. One click; everything up to the visitor's own enrolment then runs by itself. */
export function start(): void {
  load();
  if (role !== "driver" || view.state.startedAt || !loadedFor) return;
  const keys = {} as Record<KeyName, string>;
  const addresses = {} as Record<KeyName, string>;
  for (const k of KEY_NAMES) {
    keys[k] = newKey();
    addresses[k] = keyAddress(keys[k]);
  }
  store({ ...view, clock: null, live: {}, balances: NO_BALANCES, state: startedState(loadedFor, keys, addresses, Date.now()) }, true);
  tick();
}

/** The visitor files their own disclosure on the practice desk, with their own wallet. */
export function enrolYou(d: { statement: string; entries: EntryInput[]; addresses: string[] }): void {
  const s = view.state;
  if (!s.desk || !visitor || running.has("enrolYou")) return;
  void run("enrolYou", calls.enrol(s.desk, d.statement, d.entries, d.addresses));
}

/** The visitor countersigns the first spend, with their own wallet. */
export function signYou(): void {
  const s = view.state;
  if (!s.desk || !s.s1 || !visitor || visitor !== s.visitor || running.has("signYou")) return;
  void run("signYou", calls.approve(s.desk, s.s1.n));
}

/** The one click of the contrast: the teacher posts a spend that pays the print shop. */
export function askContrast(): void {
  if (view.state.contrast) return;
  setState((s) => ({ ...s, contrast: true }));
  tick();
}

/** Tries a step again after it stopped or was refused. It is looked for on the chain first, as always. */
export function retry(id: ActionId): void {
  const live = view.live[id];
  // A transaction the network never listed is given up; one it knows is followed again, never resent.
  const lost = !!action(id).hash && (!live || live.status === "UNKNOWN");
  patch(id, { phase: "waiting", note: "", tries: 0, notBefore: 0, ...(lost ? { hash: "", last: action(id).hash, markedAt: Date.now() - 30_000 } : {}) });
  tick();
}

/** Forgets this practice desk (the keys with it) so a new one can be started. Nothing on chain is undone. */
export function reset(): void {
  load();
  epoch++;
  running.clear();
  looked.clear();
  watching.clear();
  limitsRead = null;
  clockAskedAt = 0;
  if (!isMock && loadedFor) {
    try {
      localStorage.removeItem(storageKey(loadedFor));
    } catch {
      /* nothing was stored */
    }
  }
  lastRaw = "";
  store({ ...BLANK, state: blankState(loadedFor ?? ""), watching: view.watching, loaded: true }, false);
}

/** Demo mode only: moves the in-memory contract's clock past the notice window that is running. */
export function skipWait(): void {
  if (!isMock || !view.clock) return;
  const s = view.state;
  const now = chainSeconds(view.clock);
  const until = [s.s2?.noticeUntil ?? 0, s.s1?.noticeUntil ?? 0].find((u) => u > now);
  if (!until) return;
  skipMockClock(until - now + 5);
  clockAskedAt = 0;
  store({ ...view, clock: null }, false);
  tick();
}

/** Which actions have a flow running right now (the page greys their buttons). */
export const isRunning = (id: ActionId): boolean => running.has(id);
export { ACTIONS };
