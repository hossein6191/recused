// The practice desk: its script and its state. No chain access and no React in here, so node
// runs it as it is (tests/unit/practice.test.mjs).
//
// A spend needs three distinct members: one who posts it and two who countersign, and a
// countersigner's disclosure must be older than the spend. A visitor who arrives alone can
// therefore never be read on a spend that already exists. The practice desk solves that in the
// open: the page makes three accounts of its own, says so, and has them play the other members
// of a new desk. Every step is a real transaction; the visitor signs their own two with their
// own wallet.
//
// The cast is the tenants' association the demo content uses. The teacher opens the desk and
// posts both spends, so the teacher is never read. The print shop co-owner countersigns the
// first spend (a locksmith, nothing to do with printing) and then the second (the print shop
// itself), which is the contrast. The night nurse stays in reserve: a reading that does not come
// back clear is final, so without a third member one hesitant reading would leave the first
// spend unpaid for good.

import type { EntryInput, Reading } from "./chain";

export const PRACTICE_VERSION = 1;
export const PRACTICE_KEY = "recused:practice";

/** The members the page plays. */
export type Role = "teacher" | "printer" | "nurse";
export const ROLES: Role[] = ["teacher", "printer", "nurse"];
/** Every key the page makes: the three members, and two payee addresses that never sign. */
export type KeyName = Role | "locksmith" | "till";
export const KEY_NAMES: KeyName[] = ["teacher", "printer", "nurse", "locksmith", "till"];

export type CastMember = { name: string; short: string; part: string; statement: string; entries: EntryInput[] };

export const CAST: Record<Role, CastMember> = {
  teacher: {
    name: "The teacher",
    short: "teacher",
    part: "opens the desk and posts both spends, so is never read",
    statement:
      "I teach mathematics at Alder Lane Primary School and have lived in the building for six years. I own no business and sit on no committee outside this association.",
    entries: [{ name: "Alder Lane Primary School", relation: "employed_by", detail: "full-time class teacher" }],
  },
  printer: {
    name: "The print shop co-owner",
    short: "print shop co-owner",
    part: "countersigns the first spend, and is the one the second spend would pay",
    statement: "I co-own Pelican Press, the print shop on Quay Street, with my sister. The shop is most of my income.",
    entries: [{ name: "Pelican Press", relation: "part_owns", detail: "a print shop on Quay Street; I hold half of it" }],
  },
  nurse: {
    name: "The night nurse",
    short: "night nurse",
    part: "says who the second payee is, and stays in reserve in case a reading on the first spend is not clear",
    statement: "I work nights as a nurse at St Brendan's Hospital and have no business interests of any kind.",
    entries: [
      { name: "St Brendan's Hospital", relation: "employed_by", detail: "I nurse there; the hospital buys nothing from this fund and sells it nothing." },
    ],
  },
};

/** What the visitor is offered to file, and may rewrite: nothing in it touches a locksmith. */
export const VISITOR_DISCLOSURE: { statement: string; entries: EntryInput[]; addresses: string[] } = {
  statement:
    "I rent a plot at the Marsh Lane allotments and grow vegetables there for my own kitchen. I have no business interests of any kind.",
  entries: [
    { name: "Marsh Lane Allotment Society", relation: "member_of", detail: "I rent one plot; the society buys nothing from this fund and sells it nothing." },
  ],
  addresses: [],
};

const ATTO = 10n ** 18n;
/** The desk's first funding, sent by the teacher with open_desk. */
export const POT_ATTO = ATTO;
export const SPEND1 = {
  amountAtto: ATTO / 5n,
  payee: "locksmith" as const,
  payeeName: "Harrow Lane Locksmiths",
  description: "Replacement lock and three keys for the bike shed door, supplied and fitted by Harrow Lane Locksmiths.",
};
export const SPEND2 = {
  amountAtto: (ATTO * 3n) / 10n,
  payee: "till" as const,
  payeeName: "Pelican Press",
  description:
    "Printing 400 copies of the spring newsletter and 60 posters for the annual general meeting at Pelican Press, the print shop on Quay Street.",
};
/** The sentence the night nurse adds to the second spend during its notice window. */
export const identification = (printerNumber: string): string =>
  `The payee is the till of Pelican Press, the print shop on Quay Street that member ${printerNumber || "M2"} co-owns.`;

/** How long countersignatures stay open after the notice window, in minutes: time enough to come back from a break. */
export const LIVE_MINUTES = 60;
/** Seconds after a notice window closes before a countersignature is sent, so the call's own clock is past it. */
export const NOTICE_MARGIN_S = 3;
/** An identification is only sent while at least this much of the notice window is left. */
export const IDENTIFY_NEEDS_S = 75;

export type ActionId =
  | "fundTeacher"
  | "fundPrinter"
  | "fundNurse"
  | "open"
  | "enrolTeacher"
  | "enrolPrinter"
  | "enrolNurse"
  | "enrolYou"
  | "post1"
  | "signYou"
  | "signPrinter"
  | "signNurse"
  | "post2"
  | "identify2"
  | "sign2";

export const ACTIONS: ActionId[] = [
  "fundTeacher", "fundPrinter", "fundNurse", "open", "enrolTeacher", "enrolPrinter", "enrolNurse", "enrolYou", "post1",
  "signYou", "signPrinter", "signNurse", "post2", "identify2", "sign2",
];

/** Who signs each action: one of the page-held members, or the visitor's own wallet. */
export const SIGNER: Record<ActionId, Role | "you"> = {
  fundTeacher: "teacher",
  fundPrinter: "printer",
  fundNurse: "nurse",
  open: "teacher",
  enrolTeacher: "teacher",
  enrolPrinter: "printer",
  enrolNurse: "nurse",
  enrolYou: "you",
  post1: "teacher",
  signYou: "you",
  signPrinter: "printer",
  signNurse: "nurse",
  post2: "teacher",
  identify2: "nurse",
  sign2: "printer",
};

export const isFaucet = (id: ActionId): boolean => id === "fundTeacher" || id === "fundPrinter" || id === "fundNurse";
export const isVisitorAction = (id: ActionId): boolean => SIGNER[id] === "you";

/**
 * waiting   nothing sent yet (or about to be sent again after a round stored nothing)
 * checking  reading the chain to see whether the step already landed
 * signing   the key is signing and sending
 * onchain   sent; the validators have it
 * done      accepted, and the result is stored in this state
 * refused   the contract answered no and the page will not ask again by itself
 * stopped   the page could not send or follow the call; nothing is known to be wrong on chain
 */
export type Phase = "waiting" | "checking" | "signing" | "onchain" | "done" | "refused" | "stopped";

export type ActionState = {
  phase: Phase;
  /** the transaction being followed, or the one that did the step; "" when none */
  hash: string;
  /** a transaction of this step that stored nothing or was refused, kept for its explorer link */
  last: string;
  /** when a send began (ms); kept until its hash is stored, so a reload can tell a call may be in flight */
  markedAt: number;
  /** done, and found on the chain rather than sent in this sitting */
  found: boolean;
  /** done without having been sent: there was no time left, or no need */
  skipped: boolean;
  /** the refusal, the error, or what the last round did */
  note: string;
  tries: number;
  /** not to be sent again before this moment (ms) */
  notBefore: number;
};

export const blankAction = (): ActionState => ({ phase: "waiting", hash: "", last: "", markedAt: 0, found: false, skipped: false, note: "", tries: 0, notBefore: 0 });

export type SpendInfo = { n: number; noticeUntil: number; windowUntil: number; postedSeq: number };
export type MemberInfo = { number: string; filedSeq: number };
export type ReadingSlot = "you" | "printer" | "nurse" | "contrast";

export type PracticeState = {
  v: number;
  /** the register this practice desk lives on, lowercase */
  register: string;
  /** when the visitor pressed the button (ms); 0 until then */
  startedAt: number;
  /** the page-held private keys; throwaway, test GEN only */
  keys: Record<KeyName, string>;
  addresses: Record<KeyName, string>;
  label: string;
  desk: string;
  members: Partial<Record<Role | "you", MemberInfo>>;
  /** the visitor's address, fixed when their disclosure lands */
  visitor: string;
  s1: SpendInfo | null;
  s2: SpendInfo | null;
  readings: Partial<Record<ReadingSlot, Reading>>;
  /** set when a second clear reading paid the first spend */
  paid: { atto: string; to: string; by: ReadingSlot; potAtto: string } | null;
  /** the visitor asked for the contrast */
  contrast: boolean;
  actions: Record<ActionId, ActionState>;
};

const emptyKeys = (): Record<KeyName, string> => ({ teacher: "", printer: "", nurse: "", locksmith: "", till: "" });

export function blankState(register: string): PracticeState {
  const actions = {} as Record<ActionId, ActionState>;
  for (const id of ACTIONS) actions[id] = blankAction();
  return {
    v: PRACTICE_VERSION,
    register: register.toLowerCase(),
    startedAt: 0,
    keys: emptyKeys(),
    addresses: emptyKeys(),
    label: "",
    desk: "",
    members: {},
    visitor: "",
    s1: null,
    s2: null,
    readings: {},
    paid: null,
    contrast: false,
    actions,
  };
}

/** The desk's name: unique to the teacher's key, so the page can find its own desk on the chain again. */
export const deskLabel = (teacherAddress: string): string => "Practice desk " + teacherAddress.replace(/^0x/i, "").slice(0, 6).toLowerCase();

/** A started practice desk for these keys. */
export function startedState(register: string, keys: Record<KeyName, string>, addresses: Record<KeyName, string>, nowMs: number): PracticeState {
  const lower = {} as Record<KeyName, string>;
  for (const k of KEY_NAMES) lower[k] = addresses[k].toLowerCase();
  return { ...blankState(register), startedAt: nowMs, keys: { ...keys }, addresses: lower, label: deskLabel(lower.teacher) };
}

const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const PHASES: Phase[] = ["waiting", "checking", "signing", "onchain", "done", "refused", "stopped"];

/**
 * The stored state, or null when there is none for this register or it cannot be trusted.
 * A step that was mid-flight when the page closed comes back as "waiting" with its hash and its
 * mark kept: the engine then follows the hash, or reads the chain, before it sends anything.
 */
export function parseState(raw: string, register: string): PracticeState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<PracticeState>;
  if (o.v !== PRACTICE_VERSION || typeof o.register !== "string" || o.register !== register.toLowerCase()) return null;
  if (!o.startedAt || !o.keys || !o.addresses || !o.actions) return null;
  for (const k of KEY_NAMES) {
    if (!KEY_RE.test(String(o.keys[k] ?? "")) || !ADDRESS_RE.test(String(o.addresses[k] ?? ""))) return null;
  }
  const base = blankState(register);
  const actions = base.actions;
  for (const id of ACTIONS) {
    const a = (o.actions as Record<string, Partial<ActionState>>)[id];
    if (!a || typeof a !== "object") continue;
    const phase = PHASES.includes(a.phase as Phase) ? (a.phase as Phase) : "waiting";
    actions[id] = {
      // Only an outcome survives a reload; anything that was in motion is looked at again.
      phase: phase === "done" || phase === "refused" || phase === "stopped" ? phase : "waiting",
      hash: typeof a.hash === "string" && HASH_RE.test(a.hash) ? a.hash : "",
      last: typeof a.last === "string" && HASH_RE.test(a.last) ? a.last : "",
      markedAt: Number(a.markedAt) > 0 ? Number(a.markedAt) : 0,
      found: !!a.found,
      skipped: !!a.skipped,
      note: typeof a.note === "string" ? a.note : "",
      tries: Number(a.tries) > 0 ? Number(a.tries) : 0,
      notBefore: Number(a.notBefore) > 0 ? Number(a.notBefore) : 0,
    };
  }
  const spend = (s: unknown): SpendInfo | null => {
    const x = s as SpendInfo | null;
    return x && Number(x.n) > 0 ? { n: Number(x.n), noticeUntil: Number(x.noticeUntil) || 0, windowUntil: Number(x.windowUntil) || 0, postedSeq: Number(x.postedSeq) || 0 } : null;
  };
  return {
    ...base,
    startedAt: Number(o.startedAt),
    keys: { ...base.keys, ...o.keys },
    addresses: { ...base.addresses, ...o.addresses },
    label: typeof o.label === "string" ? o.label : deskLabel(String(o.addresses.teacher)),
    desk: typeof o.desk === "string" && /^D[1-9]\d{0,8}$/.test(o.desk) ? o.desk : "",
    members: o.members && typeof o.members === "object" ? { ...o.members } : {},
    visitor: typeof o.visitor === "string" && ADDRESS_RE.test(o.visitor) ? o.visitor : "",
    s1: spend(o.s1),
    s2: spend(o.s2),
    readings: o.readings && typeof o.readings === "object" ? { ...o.readings } : {},
    paid: o.paid && typeof o.paid === "object" ? { ...o.paid } : null,
    contrast: !!o.contrast,
    actions,
  };
}

// ---- the order of things ----------------------------------------------------------------

export const done = (s: PracticeState, id: ActionId): boolean => s.actions[id].phase === "done";
const all = (s: PracticeState, ids: ActionId[]): boolean => ids.every((id) => done(s, id));

/** How many clear readings the first spend has from the three who may give one. */
export function clearCount(s: PracticeState): number {
  return (["you", "printer", "nurse"] as ReadingSlot[]).filter((k) => s.readings[k]?.verdict === "clear").length;
}

/** True when the visitor and the print shop co-owner have both been read and one of them was not clear. */
export function reserveNeeded(s: PracticeState): boolean {
  return !!s.readings.you && !!s.readings.printer && !s.paid && clearCount(s) < 2;
}

/**
 * True while the first spend is being carried: the visitor's countersignature is with the
 * validators, or it has been read and the print shop co-owner's has not landed yet. The same
 * member countersigns both spends, one call at a time, so the contrast waits for this to end
 * and the payment the visitor is watching for is not held up behind it.
 */
export function firstSpendBusy(s: PracticeState): boolean {
  const mine = s.actions.signYou;
  if (mine.hash && mine.phase !== "done" && mine.phase !== "stopped" && mine.phase !== "refused") return true;
  const next = s.actions.signPrinter.phase;
  return !!s.readings.you && next !== "done" && next !== "refused" && next !== "stopped";
}

/**
 * Why an action may not be sent yet, or "" when it may. This is the whole order of the practice
 * desk. `now` is the chain's clock in seconds, 0 while it has not been read: nothing that waits
 * on a window is sent on a guess.
 */
export function blocked(s: PracticeState, id: ActionId, now: number): string {
  if (!s.startedAt) return "the practice desk has not been started";
  switch (id) {
    case "fundTeacher":
    case "fundPrinter":
    case "fundNurse":
      return "";
    case "open":
      return done(s, "fundTeacher") ? "" : "the teacher's account has no test GEN for the pot yet";
    case "enrolTeacher":
    case "enrolPrinter":
    case "enrolNurse":
      return done(s, "open") ? "" : "the desk is not open yet";
    case "enrolYou":
      if (!done(s, "open")) return "the desk is not open yet";
      // The forward-only rule, enforced by the page too: nobody may enrol into a reading after the spend exists.
      return s.s1 || s.actions.post1.hash || s.actions.post1.markedAt ? "the spend is already posted" : "";
    case "post1":
      if (!all(s, ["enrolTeacher", "enrolPrinter", "enrolNurse"])) return "the practice members have not all enrolled yet";
      return done(s, "enrolYou") ? "" : "your own disclosure has to be on chain first, or it could never be read against this spend";
    case "signYou":
      if (!s.s1 || !done(s, "post1")) return "the spend is not posted yet";
      if (!now) return "the chain's clock has not been read yet";
      return now >= s.s1.noticeUntil + NOTICE_MARGIN_S ? "" : "the notice window is still running";
    case "signPrinter":
      if (!s.s1 || !done(s, "post1")) return "the spend is not posted yet";
      if (!s.readings.you) return "your own countersignature comes first";
      if (!now) return "the chain's clock has not been read yet";
      return now >= s.s1.noticeUntil + NOTICE_MARGIN_S ? "" : "the notice window is still running";
    case "signNurse":
      if (!done(s, "signPrinter")) return "the print shop co-owner countersigns first";
      return reserveNeeded(s) ? "" : "two clear readings need no third";
    case "post2":
      if (!s.contrast) return "the contrast has not been asked for";
      return done(s, "post1") ? "" : "the first spend is posted first";
    case "identify2":
      if (!s.s2 || !done(s, "post2")) return "the second spend is not posted yet";
      return "";
    case "sign2":
      if (!s.s2 || !done(s, "post2")) return "the second spend is not posted yet";
      if (!done(s, "identify2")) return "the identification is settled first";
      if (!now) return "the chain's clock has not been read yet";
      if (now < s.s2.noticeUntil + NOTICE_MARGIN_S) return "the notice window is still running";
      return firstSpendBusy(s) ? "the print shop co-owner countersigns the first spend first" : "";
  }
}

/** True when the second spend's notice window has too little left for an identification to land in it. */
export function identifyTooLate(s: PracticeState, now: number): boolean {
  return !!s.s2 && now > 0 && now > s.s2.noticeUntil - IDENTIFY_NEEDS_S;
}

/**
 * The page-held actions that may be worked on now, in the order they are started. The visitor's
 * own two are never in this list: they wait for the visitor's click.
 */
export function nextHeld(s: PracticeState, now: number, nowMs: number): ActionId[] {
  const out: ActionId[] = [];
  for (const id of ACTIONS) {
    if (isVisitorAction(id)) continue;
    const a = s.actions[id];
    if (a.phase === "done" || a.phase === "refused" || a.phase === "stopped") continue;
    if (a.notBefore > nowMs) continue;
    if (blocked(s, id, now)) continue;
    out.push(id);
  }
  return out;
}

/** How long a call that may have left the browser is waited for before it is sent again. */
export const MARK_WAIT_MS = 45_000;

/**
 * What to do with an action before anything is sent.
 *   follow     a transaction of ours exists: follow it, never send
 *   wait       a send began and its hash was lost (the page closed): keep reading the chain
 *   read       read the chain once; send only if the step is not there
 */
export function plan(a: ActionState, nowMs: number): "follow" | "wait" | "read" {
  if (a.hash) return "follow";
  if (a.markedAt > 0 && nowMs - a.markedAt < MARK_WAIT_MS) return "wait";
  return "read";
}

// ---- the seven rows the page shows -------------------------------------------------------

export type RowId = "accounts" | "desk" | "enrol" | "spend" | "sign" | "pay" | "contrast";
export const ROWS: { id: RowId; actions: ActionId[] }[] = [
  { id: "accounts", actions: ["fundTeacher", "fundPrinter", "fundNurse"] },
  { id: "desk", actions: ["open", "enrolTeacher", "enrolPrinter", "enrolNurse"] },
  { id: "enrol", actions: ["enrolYou"] },
  { id: "spend", actions: ["post1"] },
  { id: "sign", actions: ["signYou"] },
  { id: "pay", actions: ["signPrinter", "signNurse"] },
  { id: "contrast", actions: ["post2", "identify2", "sign2"] },
];

export type RowPhase = Phase | "recused";

/** One state for a row, from the actions in it. */
export function rowPhase(s: PracticeState, row: RowId): RowPhase {
  const ids = ROWS.find((r) => r.id === row)!.actions.filter((id) => {
    if (id === "signNurse") return reserveNeeded(s) || s.actions.signNurse.phase !== "waiting";
    return true;
  });
  const phases = ids.map((id) => s.actions[id].phase);
  for (const p of ["stopped", "refused", "signing", "onchain", "checking"] as Phase[]) if (phases.includes(p)) return p;
  if (phases.every((p) => p === "done")) {
    if (row === "sign" && s.readings.you && s.readings.you.verdict !== "clear") return "recused";
    if (row === "contrast" && s.readings.contrast && s.readings.contrast.verdict !== "clear") return "recused";
    return "done";
  }
  return "waiting";
}
