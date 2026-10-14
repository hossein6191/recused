// The "catch a hidden conflict" track's engine: lib/track-engine.ts running the script in
// lib/catch.ts. This file says how each step is looked for on the chain, what each call is, and
// what each result means; the engine does the signing, the following and the resuming.

import {
  LIMITS,
  approveOutcome,
  balanceOf,
  bondCreditAfter,
  calls,
  challengeOutcome,
  filedDisclosure,
  isMock,
  openedDesk,
  postedSpend,
  readBondCredit,
  readChallenges,
  readDesk,
  readDesks,
  readLimits,
  readMember,
  readReading,
  readSpend,
  readSpends,
  type Challenge,
  type Reading,
  type Stamped,
} from "./chain";
import {
  ACTIONS,
  CAST,
  CATCH_KEY,
  HOLD_MINUTES,
  KEY_NAMES,
  POT_ATTO,
  SIGNER,
  SPEND,
  STAKE_ATTO,
  TRY_ACTION,
  WINDOW_MINUTES,
  blankState,
  blocked,
  isFaucet,
  nextHeld,
  parseState,
  startedState,
  tryMember,
  tryUrl,
  type ActionId,
  type CatchState,
  type MemberInfo,
  type Role,
  type Signer,
  type SpendInfo,
  type Try,
} from "./catch";
import { blankAction } from "./track";
import { everydayRegistry, pinnedRegistry } from "./registry";
import { createEngine, type EngineView } from "./track-engine";

export type CatchView = EngineView<CatchState>;

/**
 * The register prefix a new catch desk names: the repository's registry/ folder pinned to
 * lib/config.ts REGISTRY_COMMIT, or "" while that is not set. Demo mode reads no web page, so it
 * runs on the branch prefix when no commit is set, and the demo banner says the reading is scripted.
 */
export const catchRegistry = (): string => pinnedRegistry() || (isMock ? everydayRegistry() : "");

type Found =
  | { kind: "funded" }
  | { kind: "desk"; desk: string }
  | { kind: "member"; member: MemberInfo }
  | { kind: "spend"; spend: SpendInfo; clock: Stamped }
  | { kind: "reading"; reading: Reading; held: { until: number; at: number } | null }
  | { kind: "credit"; credit: string; who: string }
  | { kind: "result"; result: Challenge; credit: string; who: string };

const memberOf: Partial<Record<ActionId, Role>> = { enrolInes: "ines", enrolMara: "mara", enrolTomas: "tomas", enrolElin: "elin" };
const signerOf: Partial<Record<ActionId, Signer>> = { signMara: "mara", signTomas: "tomas", signElin: "elin" };
const tryOf: Partial<Record<ActionId, Try>> = { tryClean: "clean", tryUnclear: "unclear", catchIt: "catch" };

let noticeRead = 0;
async function notice(): Promise<number> {
  if (noticeRead) return noticeRead;
  let l = LIMITS;
  try {
    l = (await readLimits()).data;
  } catch {
    /* the limits written into the site stand in */
  }
  noticeRead = l.noticeMinutes[0];
  return noticeRead;
}

const engine = createEngine<CatchState, Found>({
  key: CATCH_KEY,
  keyNames: KEY_NAMES,
  signer: SIGNER,
  isFaucet: (id) => isFaucet(id as ActionId),
  blank: blankState,
  parse: parseState,
  started: (register, keys, addresses, nowMs) => startedState(register, keys, addresses, nowMs, catchRegistry()),
  nextHeld,
  blocked: (s, id, now) => blocked(s, id as ActionId, now),

  async look(s, id, who) {
    const fresh = { fresh: true };
    if (id === "open") {
      const rows = (await readDesks(undefined, fresh)).data.rows.filter((d) => d.label === s.label);
      for (const row of rows) {
        const d = (await readDesk(row.id, fresh)).data;
        if (d && d.opener === s.addresses.ines) return { kind: "desk", desk: d.id };
      }
      return null;
    }
    if (!s.desk) return null;
    if (memberOf[id as ActionId]) {
      const m = (await readMember(s.desk, who, fresh)).data;
      return m ? { kind: "member", member: { number: m.number, filedSeq: m.filedSeq } } : null;
    }
    if (id === "post") {
      const row = (await readSpends(s.desk, fresh)).data.rows.find((r) => r.payee === s.addresses.gull);
      if (!row) return null;
      const sp = (await readSpend(s.desk, row.n, fresh)).data;
      if (!sp) return null;
      return {
        kind: "spend",
        spend: { n: sp.n, noticeUntil: sp.noticeUntil, windowUntil: sp.windowUntil, postedSeq: sp.postedSeq },
        clock: { chainNow: sp.chainNow, readAtMs: sp.readAtMs },
      };
    }
    const signer = signerOf[id as ActionId];
    if (signer) {
      if (!s.spend) return null;
      const reading = (await readReading(s.desk, s.spend.n, who, fresh)).data;
      if (!reading) return null;
      let held: { until: number; at: number } | null = null;
      if (reading.verdict === "clear") {
        const sp = (await readSpend(s.desk, s.spend.n, fresh)).data;
        if (sp && sp.holds > 0 && sp.holdUntil > 0) held = { until: sp.holdUntil, at: sp.heldAt };
      }
      return { kind: "reading", reading, held };
    }
    if (!who) return null;
    if (id === "deposit") {
      const c = (await readBondCredit(who, fresh)).data;
      // Credit already enough for a challenge needs no deposit.
      return BigInt(c.creditAtto) >= BigInt(c.bondAtto) && BigInt(c.creditAtto) > 0n ? { kind: "credit", credit: c.creditAtto, who } : null;
    }
    if (id === "withdraw") {
      const c = (await readBondCredit(who, fresh)).data;
      return BigInt(c.creditAtto) === 0n ? { kind: "credit", credit: "0", who } : null;
    }
    const t = tryOf[id as ActionId];
    if (t && s.spend) {
      const page = (await readChallenges(s.desk, s.spend.n, 0, LIMITS.challengesPage, fresh)).data;
      const url = tryUrl(s, t);
      const member = tryMember(s, t);
      const row = page?.rows.find((r) => r.challenger === who && r.url === url && (!member || r.member === member));
      if (!row) return null;
      const c = (await readBondCredit(who, fresh)).data;
      return { kind: "result", result: row, credit: c.creditAtto, who };
    }
    return null;
  },

  resultOf(s, id, tx, who) {
    if (tx.exec === "ERROR") return null;
    if (id === "open") {
      const d = openedDesk(tx);
      return d ? { kind: "desk", desk: d.desk } : null;
    }
    if (memberOf[id as ActionId]) {
      const m = filedDisclosure(tx);
      return m ? { kind: "member", member: { number: m.member, filedSeq: m.filedSeq } } : null;
    }
    if (id === "post") {
      const p = postedSpend(tx);
      return p
        ? { kind: "spend", spend: { n: p.n, noticeUntil: p.noticeUntil, windowUntil: p.windowUntil, postedSeq: p.postedSeq }, clock: { chainNow: 0, readAtMs: 0 } }
        : null;
    }
    if (signerOf[id as ActionId]) {
      const o = approveOutcome(tx);
      if (o.kind === "holding") return { kind: "reading", reading: o.reading, held: { until: o.holdUntil, at: o.heldAt } };
      if (o.kind === "counted" || o.kind === "recused") return { kind: "reading", reading: o.reading, held: null };
      return null;
    }
    if (id === "deposit" || id === "withdraw") {
      const credit = bondCreditAfter(tx);
      return credit === null ? null : { kind: "credit", credit, who };
    }
    const t = tryOf[id as ActionId];
    if (t) {
      const o = challengeOutcome(tx);
      return o.kind === "settled" ? { kind: "result", result: o.challenge, credit: o.bondCreditAtto, who } : null;
    }
    void s;
    return null;
  },

  land(s, id, f) {
    const next: CatchState = { ...s };
    if (f.kind === "desk") next.desk = f.desk;
    if (f.kind === "member") next.members = { ...s.members, [memberOf[id as ActionId]!]: f.member };
    if (f.kind === "spend") next.spend = f.spend;
    if (f.kind === "reading") {
      next.readings = { ...s.readings, [signerOf[id as ActionId]!]: f.reading };
      if (f.held && !s.held) next.held = f.held;
    }
    if (f.kind === "credit") {
      next.credit = f.credit;
      if (!s.visitor) next.visitor = f.who;
    }
    if (f.kind === "result") {
      next.results = { ...s.results, [tryOf[id as ActionId]!]: f.result };
      next.credit = f.credit;
      if (!s.visitor) next.visitor = f.who;
    }
    return next;
  },

  stamp: (f) => (f.kind === "spend" ? f.clock : null),

  async callFor(s, id) {
    if (id === "open") return calls.openDesk(s.label, [], POT_ATTO, await notice(), [s.registry], STAKE_ATTO, HOLD_MINUTES);
    const member = memberOf[id as ActionId];
    if (member) return calls.enrol(s.desk, CAST[member].statement, CAST[member].entries, [], CAST[member].publicName, STAKE_ATTO);
    if (id === "post") return calls.postSpend(s.desk, s.addresses.gull, SPEND.amountAtto, SPEND.description, await notice(), WINDOW_MINUTES);
    if (signerOf[id as ActionId]) return calls.approve(s.desk, s.spend!.n);
    throw new Error("no call for " + id);
  },

  passing: /notice window of S\d+ runs to|a model could not be reached|no node could reach a model|no readable clock|no desk D\d+$|no spend S\d+ on|only a member of|has \d members and a spend needs/i,

  clockSpend: (s) => (s.desk && s.spend ? { desk: s.desk, n: s.spend.n } : null),
  watches: (s) => {
    const caught = s.results.catch;
    if (!caught || !s.visitor || !s.balanceBefore || BigInt(caught.bountyAtto) <= 0n) return [];
    return [{ key: "you", address: s.visitor, atLeast: BigInt(s.balanceBefore) + BigInt(caught.bountyAtto) }];
  },
  resumeVisitor: (s) =>
    s.spend ? (["deposit", "tryClean", "tryUnclear", "catchIt", "withdraw"] as ActionId[]).filter((id) => id === "deposit" || s.actions[id].hash || s.actions[id].markedAt) : [],
  deadlines: (s) => [s.spend?.noticeUntil ?? 0, s.held?.until ?? 0],
  async beforeVisitorSend(_s, id, who) {
    if (id !== "catchIt") return null;
    try {
      return { balanceBefore: (await balanceOf(who)).toString() };
    } catch {
      return null;
    }
  },
});

export const subscribe = engine.subscribe;
export const snapshot = engine.snapshot;
export const serverSnapshot = engine.serverSnapshot;
export const attach = engine.attach;
export const setVisitor = engine.setVisitor;
export const retry = (id: ActionId) => engine.retry(id);
export const skipWait = engine.skipWait;
export const isRunning = (id: ActionId) => engine.isRunning(id);
export const reset = () => {
  noticeRead = 0;
  engine.reset();
};

/** Starts the track; refused while no pinned register is set, because the desk names it for good. */
export function start(): void {
  if (!catchRegistry()) return;
  engine.start();
}

/** The visitor puts up bond credit, with their own wallet. A second deposit tops it up. */
export function depositBond(amountAtto: bigint): void {
  const s = engine.snapshot().state;
  if (!s.desk || amountAtto <= 0n) return;
  if (s.actions.deposit.phase === "done") engine.update((x) => ({ ...x, actions: { ...x.actions, deposit: blankAction() } }));
  engine.visitor("deposit", calls.deposit(amountAtto));
}

/** The visitor cites one register page against one counted signature, with their own wallet. */
export function cite(t: Try): void {
  const s = engine.snapshot().state;
  if (!s.desk || !s.spend) return;
  const member = tryMember(s, t);
  if (!member) return;
  engine.visitor(TRY_ACTION[t], calls.challenge(s.desk, s.spend.n, member, tryUrl(s, t)));
}

/** The visitor takes back all of their bond credit. */
export function withdrawBond(): void {
  const s = engine.snapshot().state;
  if (!s.desk) return;
  engine.visitor("withdraw", calls.withdraw());
}

export { ACTIONS };
