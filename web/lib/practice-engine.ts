// The first practice track's engine: lib/track-engine.ts running the script in lib/practice.ts.
// This file says how each step is looked for on the chain, what each call is, and what each
// result means; the engine does the signing, the following and the resuming. No React in here;
// app/practice/page.tsx reads the view through useSyncExternalStore and calls the functions below.

import {
  LIMITS,
  approveOutcome,
  calls,
  filedDisclosure,
  identified,
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
  releaseOutcome,
  type EntryInput,
  type Reading,
  type Stamped,
} from "./chain";
import { everydayRegistry } from "./registry";
import {
  ACTIONS,
  CAST,
  HOLD_MINUTES,
  KEY_NAMES,
  LIVE_MINUTES,
  POT_ATTO,
  PRACTICE_KEY,
  SIGNER,
  SPEND1,
  SPEND2,
  STAKE_ATTO,
  blankState,
  blocked,
  identification,
  identifyTooLate,
  isFaucet,
  nextHeld,
  parseState,
  startedState,
  type ActionId,
  type MemberInfo,
  type PracticeState,
  type ReadingSlot,
  type Role,
  type SpendInfo,
} from "./practice";
import { createEngine, type EngineView } from "./track-engine";

export type PracticeView = EngineView<PracticeState>;

/** What a step left on the chain, when it is there. */
type Found =
  | { kind: "funded" }
  | { kind: "desk"; desk: string }
  | { kind: "member"; member: MemberInfo; who: string }
  | { kind: "spend"; spend: SpendInfo; clock: Stamped }
  | { kind: "ident" }
  | { kind: "reading"; reading: Reading; holdUntil: number }
  | { kind: "paid"; atto: string; to: string; potAtto: string };

const role2reading: Partial<Record<ActionId, ReadingSlot>> = { signYou: "you", signPrinter: "printer", signNurse: "nurse", sign2: "contrast" };
const role2member: Partial<Record<ActionId, Role | "you">> = { enrolTeacher: "teacher", enrolPrinter: "printer", enrolNurse: "nurse", enrolYou: "you" };

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

const engine = createEngine<PracticeState, Found>({
  key: PRACTICE_KEY,
  keyNames: KEY_NAMES,
  signer: SIGNER,
  isFaucet: (id) => isFaucet(id as ActionId),
  blank: blankState,
  parse: parseState,
  started: startedState,
  nextHeld,
  blocked: (s, id, now) => blocked(s, id as ActionId, now),

  async look(s, id, who) {
    const fresh = { fresh: true };
    if (id === "open") {
      const rows = (await readDesks(undefined, fresh)).data.rows.filter((d) => d.label === s.label);
      for (const row of rows) {
        const d = (await readDesk(row.id, fresh)).data;
        if (d && d.opener === s.addresses.teacher) return { kind: "desk", desk: d.id };
      }
      return null;
    }
    if (!s.desk) return null;
    if (role2member[id as ActionId]) {
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
        spend: { n: sp.n, noticeUntil: sp.noticeUntil, windowUntil: sp.windowUntil, postedSeq: sp.postedSeq, holdUntil: sp.holdUntil },
        clock: { chainNow: sp.chainNow, readAtMs: sp.readAtMs },
      };
    }
    if (id === "identify2") {
      if (!s.s2) return null;
      const list = (await readIdents(s.desk, s.s2.n, fresh)).data;
      return list.some((i) => i.by === s.addresses.nurse) ? { kind: "ident" } : null;
    }
    if (id === "release1") {
      if (!s.s1) return null;
      const sp = (await readSpend(s.desk, s.s1.n, fresh)).data;
      return sp && sp.state === "paid" ? { kind: "paid", atto: sp.amountAtto, to: sp.payee, potAtto: "" } : null;
    }
    const slot = role2reading[id as ActionId];
    if (slot) {
      const spend = id === "sign2" ? s.s2 : s.s1;
      if (!spend || !who) return null;
      const reading = (await readReading(s.desk, spend.n, who, fresh)).data;
      if (!reading) return null;
      let holdUntil = 0;
      if (id !== "sign2" && reading.verdict === "clear") {
        const sp = (await readSpend(s.desk, spend.n, fresh)).data;
        if (sp && (sp.state === "holding" || sp.state === "paid") && sp.approver2 === who) holdUntil = sp.holdUntil;
      }
      return { kind: "reading", reading, holdUntil };
    }
    return null;
  },

  resultOf(_s, id, tx, who) {
    if (tx.exec === "ERROR") return null;
    if (id === "open") {
      const d = openedDesk(tx);
      return d ? { kind: "desk", desk: d.desk } : null;
    }
    if (role2member[id as ActionId]) {
      const m = filedDisclosure(tx);
      return m ? { kind: "member", member: { number: m.member, filedSeq: m.filedSeq }, who } : null;
    }
    if (id === "post1" || id === "post2") {
      const p = postedSpend(tx);
      // The clock is stamped by a view afterwards; the transaction only says when the windows end.
      return p
        ? { kind: "spend", spend: { n: p.n, noticeUntil: p.noticeUntil, windowUntil: p.windowUntil, postedSeq: p.postedSeq, holdUntil: 0 }, clock: { chainNow: 0, readAtMs: 0 } }
        : null;
    }
    if (id === "identify2") return identified(tx) ? { kind: "ident" } : null;
    if (id === "release1") {
      const o = releaseOutcome(tx);
      return o.kind === "paid" ? { kind: "paid", atto: o.paidAtto, to: o.to, potAtto: o.potAtto } : null;
    }
    if (role2reading[id as ActionId]) {
      const o = approveOutcome(tx);
      if (o.kind === "holding") return { kind: "reading", reading: o.reading, holdUntil: o.holdUntil };
      if (o.kind === "counted" || o.kind === "recused") return { kind: "reading", reading: o.reading, holdUntil: 0 };
    }
    return null;
  },

  land(s, id, f) {
    const next: PracticeState = { ...s };
    if (f.kind === "desk") next.desk = f.desk;
    if (f.kind === "member") {
      const who = role2member[id as ActionId]!;
      next.members = { ...s.members, [who]: f.member };
      if (who === "you") next.visitor = f.who;
    }
    if (f.kind === "spend") {
      if (id === "post1") next.s1 = f.spend;
      else next.s2 = f.spend;
    }
    if (f.kind === "reading") {
      next.readings = { ...s.readings, [role2reading[id as ActionId]!]: f.reading };
      if (f.holdUntil && s.s1 && id !== "sign2") next.s1 = { ...s.s1, holdUntil: f.holdUntil };
    }
    if (f.kind === "paid") next.paid = { atto: f.atto, to: f.to, potAtto: f.potAtto };
    return next;
  },

  stamp: (f) => (f.kind === "spend" ? f.clock : null),

  async callFor(s, id) {
    const member = role2member[id as ActionId];
    // The desk's own minimum notice is the shortest the contract takes, so the practice spends may use it.
    if (id === "open")
      return calls.openDesk(s.label, [], POT_ATTO, (await windows()).noticeMinutes, [everydayRegistry()], STAKE_ATTO, HOLD_MINUTES);
    if (member && member !== "you") return calls.enrol(s.desk, CAST[member].statement, CAST[member].entries, [], CAST[member].publicName, STAKE_ATTO);
    if (id === "post1" || id === "post2") {
      const sp = id === "post1" ? SPEND1 : SPEND2;
      const w = await windows();
      return calls.postSpend(s.desk, s.addresses[sp.payee], sp.amountAtto, sp.description, w.noticeMinutes, w.windowMinutes);
    }
    if (id === "identify2") return calls.identify(s.desk, s.s2!.n, identification(s.members.printer?.number ?? ""));
    if (id === "sign2") return calls.approve(s.desk, s.s2!.n);
    if (id === "signYou" || id === "signPrinter" || id === "signNurse") return calls.approve(s.desk, s.s1!.n);
    if (id === "release1") return calls.release(s.desk, s.s1!.n);
    throw new Error("no call for " + id);
  },

  passing:
    /notice window of S\d+ runs to|the hold of S\d+ runs to|a model could not be reached|no node could reach a model|no readable clock|no desk D\d+$|no spend S\d+ on|only a member of|has \d members and a spend needs/i,

  skipBeforeSend: (s, id, now) =>
    id === "identify2" && identifyTooLate(s, now)
      ? { found: { kind: "ident" }, note: "The notice window had too little left for an identification to land in it, so none was sent." }
      : null,
  landRefused: (_s, id) => (id === "identify2" ? { kind: "ident" } : null),

  clockSpend: (s) => {
    const spend = s.s2 ?? s.s1;
    return s.desk && spend ? { desk: s.desk, n: spend.n } : null;
  },
  watches: (s) => (s.paid ? [{ key: "locksmith", address: s.addresses.locksmith, atLeast: BigInt(s.paid.atto || "0") }] : []),
  resumeVisitor: (s) => {
    const out: ActionId[] = [];
    if (!s.s1) out.push("enrolYou");
    if (s.s1 && s.members.you) out.push("signYou");
    return out;
  },
  deadlines: (s) => [s.s1?.noticeUntil ?? 0, s.s2?.noticeUntil ?? 0, s.s1?.holdUntil ?? 0],
});

export const subscribe = engine.subscribe;
export const snapshot = engine.snapshot;
export const serverSnapshot = engine.serverSnapshot;
export const attach = engine.attach;
export const setVisitor = engine.setVisitor;
export const start = engine.start;
export const retry = (id: ActionId) => engine.retry(id);
export const reset = () => {
  limitsRead = null;
  engine.reset();
};
export const skipWait = engine.skipWait;
export const isRunning = (id: ActionId) => engine.isRunning(id);

/** The visitor files their own disclosure on the practice desk, with their own wallet, staking the desk's member stake. */
export function enrolYou(d: { statement: string; entries: EntryInput[]; addresses: string[]; publicName: string }): void {
  const s = engine.snapshot().state;
  if (!s.desk) return;
  engine.visitor("enrolYou", calls.enrol(s.desk, d.statement, d.entries, d.addresses, d.publicName, STAKE_ATTO));
}

/** The visitor countersigns the first spend, with their own wallet. */
export function signYou(): void {
  const s = engine.snapshot().state;
  if (!s.desk || !s.s1) return;
  engine.visitor("signYou", calls.approve(s.desk, s.s1.n));
}

/** The one click of the contrast: the teacher posts a spend that pays the print shop. */
export function askContrast(): void {
  if (engine.snapshot().state.contrast) return;
  engine.update((s) => ({ ...s, contrast: true }));
}

export { ACTIONS };
