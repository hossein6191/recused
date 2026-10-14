// The practice desk's second track, "catch a hidden conflict": its script and its state. No chain
// access and no React in here, so node runs it as it is (tests/unit/catch.test.mjs).
//
// Version 2's promise, tried by one visitor alone. The page makes four practice accounts of its own
// and has them open a desk whose one register is the repository's registry/ folder pinned to a
// commit (lib/config.ts REGISTRY_COMMIT), enrol with stakes, post a spend that pays Gull Catering
// Ltd, and countersign it twice, clear. One of the two, Mara Quist, is a director of Gull Catering
// and her disclosure never says so: she reads clear, because the reading can only read what she
// filed. The spend goes into its hold and the page stops. The visitor, with their own wallet, puts
// up bond credit and cites the register's Gull Catering page against her signature. Every validator
// fetches the page itself and reads it; if they agree it shows a relation she hid, her signature is
// struck, the spend goes back to open and her stake pays the visitor, in that one transaction.
// Before that the visitor may try two pages that come out otherwise: Pelican Press names her only
// for the print shop she filed (clean, so the bond goes to her), and Heron Signs never names the
// other signer at all (unclear, so the bond stays in the visitor's credit).
//
// The cast and every text they file are the ones tests/on_chain/smoke.mjs measured on Studio.

import type { Challenge, EntryInput, Reading } from "./contract";
import { CHALLENGE_BOND_ATTO } from "./contract";
import { REGISTER_PAGES } from "./registry";
import { blankAction, heldNext, parseActions, parseKeys, ADDRESS_RE, DESK_RE, type ActionState, type Phase } from "./track";

export const CATCH_VERSION = 1;
export const CATCH_KEY = "recused:catch";
/** Which practice track this browser shows: "catch" for this one, nothing for the first. */
export const TRACK_KEY = "recused:practice-track";

/** The members the page plays. Ines opens the desk and posts the spend; Elin is held in reserve. */
export type Role = "ines" | "mara" | "tomas" | "elin";
export const ROLES: Role[] = ["ines", "mara", "tomas", "elin"];
/** Every key the page makes: the four members, and Gull Catering's address, which never signs. */
export type KeyName = Role | "gull";
export const KEY_NAMES: KeyName[] = ["ines", "mara", "tomas", "elin", "gull"];

export type CastMember = { publicName: string; part: string; statement: string; entries: EntryInput[] };

export const CAST: Record<Role, CastMember> = {
  ines: {
    publicName: "Ines Corrie",
    part: "keeps the residents' minutes, opens the desk and posts the spend, so is never read",
    statement: "I keep the minutes of the Pelican Street Residents Association and run no business of my own.",
    entries: [{ name: "Pelican Street Residents Association", relation: "member_of", detail: "I keep its minutes; it holds no money and sells nothing." }],
  },
  mara: {
    publicName: "Mara Quist",
    part: "co-owns a print shop, sits on the board of Gull Catering, and never says so",
    statement: "I co-own Pelican Press, a two-person print shop on the same street, with my sister.",
    entries: [{ name: "Pelican Press", relation: "part_owns", detail: "A two-person print shop at the end of the street; my sister owns the other half." }],
  },
  tomas: {
    publicName: "Tomas Brandt",
    part: "chairs the bike group and countersigns second",
    statement: "I chair the tenants' bike group, a club with its own small kitty that buys and sells nothing.",
    entries: [{ name: "Pelican Street tenants' bike group", relation: "officer_of", detail: "I chair it; it has its own kitty and buys nothing from anyone on this street." }],
  },
  elin: {
    publicName: "Elin Varga",
    part: "teaches at the school and stays in reserve, in case one reading is not clear",
    statement: "I teach at the local school and have no business interests of any kind.",
    entries: [{ name: "Hillside Primary School", relation: "employed_by", detail: "I teach there; the school buys nothing from this fund and sells it nothing." }],
  },
};

const ATTO = 10n ** 18n;
/** The desk's first funding, sent by Ines with open_desk. */
export const POT_ATTO = ATTO;
/** What every member stakes to sign: 1 GEN, so the half a hidden conflict pays out is easy to see. */
export const STAKE_ATTO = ATTO;
/** How long the carried spend waits, open to challenge: room for every try and for a slow round. */
export const HOLD_MINUTES = 30;
/** The whole window of the spend: long enough that a struck spend goes back to open instead of expiring. */
export const WINDOW_MINUTES = 120;
/** What the page suggests the visitor deposits as bond credit: enough for the clean try, the unclear try and the catch. */
export const BOND_DEPOSIT_ATTO = 2n * CHALLENGE_BOND_ATTO;
/** Seconds after a window closes on the chain before a call that waits for it is sent. */
export const MARGIN_S = 3;
/** Below this much of the hold left, the page warns that a slow round may land after it ends. */
export const HOLD_ROOM_S = 4 * 60;

export const SPEND = {
  amountAtto: (ATTO * 2n) / 5n,
  payeeName: "Gull Catering Ltd",
  description: "Refreshments for the street open day from Gull Catering Ltd",
};

/** The three pages the visitor may cite, each against the signature it is meant for. */
export type Try = "clean" | "unclear" | "catch";
export const TRY_PAGE: Record<Try, string> = {
  catch: "gull-catering-ltd.html",
  clean: "pelican-press-ltd.html",
  unclear: "heron-signs-ltd.html",
};
export const pageOf = (t: Try) => REGISTER_PAGES.find((p) => p.file === TRY_PAGE[t])!;

export type ActionId =
  | "fundInes"
  | "fundMara"
  | "fundTomas"
  | "fundElin"
  | "open"
  | "enrolInes"
  | "enrolMara"
  | "enrolTomas"
  | "enrolElin"
  | "post"
  | "signMara"
  | "signTomas"
  | "signElin"
  | "deposit"
  | "tryClean"
  | "tryUnclear"
  | "catchIt"
  | "withdraw";

export const ACTIONS: ActionId[] = [
  "fundInes", "fundMara", "fundTomas", "fundElin", "open", "enrolInes", "enrolMara", "enrolTomas", "enrolElin", "post",
  "signMara", "signTomas", "signElin", "deposit", "tryClean", "tryUnclear", "catchIt", "withdraw",
];

/** Who signs each action: one of the page-held members, or the visitor's own wallet. */
export const SIGNER: Record<ActionId, Role | "you"> = {
  fundInes: "ines",
  fundMara: "mara",
  fundTomas: "tomas",
  fundElin: "elin",
  open: "ines",
  enrolInes: "ines",
  enrolMara: "mara",
  enrolTomas: "tomas",
  enrolElin: "elin",
  post: "ines",
  signMara: "mara",
  signTomas: "tomas",
  signElin: "elin",
  deposit: "you",
  tryClean: "you",
  tryUnclear: "you",
  catchIt: "you",
  withdraw: "you",
};

export const isFaucet = (id: ActionId): boolean => id.startsWith("fund");
export const isVisitorAction = (id: ActionId): boolean => SIGNER[id] === "you";
export const TRY_ACTION: Record<Try, ActionId> = { clean: "tryClean", unclear: "tryUnclear", catch: "catchIt" };

export type SpendInfo = { n: number; noticeUntil: number; windowUntil: number; postedSeq: number };
export type MemberInfo = { number: string; filedSeq: number };
export type Signer = "mara" | "tomas" | "elin";

export type CatchState = {
  v: number;
  register: string;
  startedAt: number;
  keys: Record<KeyName, string>;
  addresses: Record<KeyName, string>;
  /** the register prefix the desk names, fixed when the track started: the pinned registry/ folder */
  registry: string;
  label: string;
  desk: string;
  members: Partial<Record<Role, MemberInfo>>;
  visitor: string;
  spend: SpendInfo | null;
  readings: Partial<Record<Signer, Reading>>;
  /** set when two clear readings put the spend in its hold */
  held: { until: number; at: number } | null;
  /** what each of the visitor's three tries settled */
  results: Partial<Record<Try, Challenge>>;
  /** the visitor's bond credit as the last deposit or challenge left it, in atto; "" until known */
  credit: string;
  /** the visitor's wallet balance just before the catch was sent, so the bounty can be seen to arrive */
  balanceBefore: string;
  actions: Record<ActionId, ActionState>;
};

const emptyKeys = (): Record<KeyName, string> => ({ ines: "", mara: "", tomas: "", elin: "", gull: "" });

export function blankState(register: string): CatchState {
  const actions = {} as Record<ActionId, ActionState>;
  for (const id of ACTIONS) actions[id] = blankAction();
  return {
    v: CATCH_VERSION,
    register: register.toLowerCase(),
    startedAt: 0,
    keys: emptyKeys(),
    addresses: emptyKeys(),
    registry: "",
    label: "",
    desk: "",
    members: {},
    visitor: "",
    spend: null,
    readings: {},
    held: null,
    results: {},
    credit: "",
    balanceBefore: "",
    actions,
  };
}

/** The desk's name: unique to the opener's key, so the page can find its own desk on the chain again. */
export const deskLabel = (inesAddress: string): string => "Register desk " + inesAddress.replace(/^0x/i, "").slice(0, 6).toLowerCase();

/** A started track for these keys and this register prefix. */
export function startedState(register: string, keys: Record<string, string>, addresses: Record<string, string>, nowMs: number, registry: string): CatchState {
  const k = emptyKeys();
  const lower = emptyKeys();
  for (const n of KEY_NAMES) {
    k[n] = keys[n];
    lower[n] = addresses[n].toLowerCase();
  }
  return { ...blankState(register), startedAt: nowMs, keys: k, addresses: lower, registry, label: deskLabel(lower.ines) };
}

export function parseState(raw: string, register: string): CatchState | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Partial<CatchState>;
  if (o.v !== CATCH_VERSION || typeof o.register !== "string" || o.register !== register.toLowerCase()) return null;
  if (!o.startedAt || !o.keys || !o.addresses || !o.actions || typeof o.registry !== "string" || !o.registry) return null;
  const keys = parseKeys(o, KEY_NAMES);
  if (!keys) return null;
  const base = blankState(register);
  const x = o.spend as SpendInfo | null | undefined;
  const h = o.held as CatchState["held"] | undefined;
  return {
    ...base,
    startedAt: Number(o.startedAt),
    keys: { ...base.keys, ...keys.keys },
    addresses: { ...base.addresses, ...keys.addresses },
    registry: o.registry,
    label: typeof o.label === "string" ? o.label : deskLabel(String(keys.addresses.ines)),
    desk: typeof o.desk === "string" && DESK_RE.test(o.desk) ? o.desk : "",
    members: o.members && typeof o.members === "object" ? { ...o.members } : {},
    visitor: typeof o.visitor === "string" && ADDRESS_RE.test(o.visitor) ? o.visitor : "",
    spend: x && Number(x.n) > 0 ? { n: Number(x.n), noticeUntil: Number(x.noticeUntil) || 0, windowUntil: Number(x.windowUntil) || 0, postedSeq: Number(x.postedSeq) || 0 } : null,
    readings: o.readings && typeof o.readings === "object" ? { ...o.readings } : {},
    held: h && Number(h.until) > 0 ? { until: Number(h.until), at: Number(h.at) || 0 } : null,
    results: o.results && typeof o.results === "object" ? { ...o.results } : {},
    credit: typeof o.credit === "string" && /^\d*$/.test(o.credit) ? o.credit : "",
    balanceBefore: typeof o.balanceBefore === "string" && /^\d*$/.test(o.balanceBefore) ? o.balanceBefore : "",
    actions: parseActions(o.actions, ACTIONS) as Record<ActionId, ActionState>,
  };
}

// ---- the order of things ----------------------------------------------------------------

export const done = (s: CatchState, id: ActionId): boolean => s.actions[id].phase === "done";
const all = (s: CatchState, ids: ActionId[]): boolean => ids.every((id) => done(s, id));

const SIGNERS: Signer[] = ["mara", "tomas", "elin"];
const SIGN_ACTION: Record<Signer, ActionId> = { mara: "signMara", tomas: "signTomas", elin: "signElin" };

export const clearCount = (s: CatchState): number => SIGNERS.filter((k) => s.readings[k]?.verdict === "clear").length;

/** True when Mara and Tomas have both been read and one of them was not clear: Elin countersigns. */
export const reserveNeeded = (s: CatchState): boolean => !!s.readings.mara && !!s.readings.tomas && !s.held && clearCount(s) < 2;

/** The two whose clear readings put the spend in its hold, in the order they were counted. */
export function countedSigners(s: CatchState): Signer[] {
  return SIGNERS.filter((k) => s.readings[k]?.verdict === "clear").slice(0, 2);
}

/** Mara's signature is one of the two counted, so there is a hidden relation to catch. */
export const maraCounted = (s: CatchState): boolean => !!s.held && countedSigners(s).includes("mara");

/** The counted signer who is not Mara: the one the unclear try cites a page against. */
export const otherSigner = (s: CatchState): Signer | null => countedSigners(s).find((k) => k !== "mara") ?? null;

/** Which signer each try cites its page against. */
export const tryTarget = (s: CatchState, t: Try): Signer | null => (t === "unclear" ? otherSigner(s) : maraCounted(s) ? "mara" : null);

/** The member number ("M2") a try cites, or "" when it has nobody to cite. */
export const tryMember = (s: CatchState, t: Try): string => {
  const who = tryTarget(s, t);
  return who ? (s.members[who]?.number ?? "") : "";
};

/** The register page a try cites, under the desk's pinned prefix. */
export const tryUrl = (s: CatchState, t: Try): string => s.registry + TRY_PAGE[t];

/** Another of the visitor's own calls is with the wallet or the network: theirs go one at a time. */
const visitorBusy = (s: CatchState, self: ActionId): boolean =>
  (["deposit", "tryClean", "tryUnclear", "catchIt", "withdraw"] as ActionId[]).some((id) => {
    if (id === self) return false;
    const p = s.actions[id].phase;
    return p === "checking" || p === "signing" || p === "onchain";
  });

/** The hold is over (its end has passed on the chain's clock, or a strike ended it). */
export const holdOver = (s: CatchState, now: number): boolean => !!s.results.catch || (!!s.held && now > 0 && now >= s.held.until);

/**
 * Why an action may not be sent yet, or "" when it may. This is the whole order of the track. `now`
 * is the chain's clock in seconds, 0 while it has not been read: nothing that waits on a window is
 * sent on a guess.
 */
export function blocked(s: CatchState, id: ActionId, now: number): string {
  if (!s.startedAt) return "the practice desk has not been started";
  switch (id) {
    case "fundInes":
    case "fundMara":
    case "fundTomas":
    case "fundElin":
      return "";
    case "open":
      return done(s, "fundInes") ? "" : "Ines's account has no test GEN for the pot yet";
    case "enrolInes":
    case "enrolMara":
    case "enrolTomas":
    case "enrolElin": {
      if (!done(s, "open")) return "the desk is not open yet";
      const fund = ("fund" + id.slice(5)) as ActionId;
      return done(s, fund) ? "" : "this member's account has no test GEN for the stake yet";
    }
    case "post":
      return all(s, ["enrolInes", "enrolMara", "enrolTomas", "enrolElin"]) ? "" : "the practice members have not all enrolled yet";
    case "signMara":
      if (!s.spend || !done(s, "post")) return "the spend is not posted yet";
      if (!now) return "the chain's clock has not been read yet";
      return now >= s.spend.noticeUntil + MARGIN_S ? "" : "the notice window is still running";
    case "signTomas":
      if (!s.spend || !done(s, "post")) return "the spend is not posted yet";
      if (!s.readings.mara) return "Mara countersigns first";
      if (!now) return "the chain's clock has not been read yet";
      return now >= s.spend.noticeUntil + MARGIN_S ? "" : "the notice window is still running";
    case "signElin":
      if (!done(s, "signTomas")) return "Tomas countersigns first";
      return reserveNeeded(s) ? "" : "two clear readings need no third";
    case "deposit":
      if (!s.spend) return "the spend is not posted yet";
      return visitorBusy(s, id) ? "one of your calls is still with the network" : "";
    case "tryClean":
    case "tryUnclear":
    case "catchIt": {
      const t: Try = id === "tryClean" ? "clean" : id === "tryUnclear" ? "unclear" : "catch";
      if (!s.held) return "the spend is not in its hold yet";
      if (s.results.catch) return "the hold ended when Mara's signature was struck";
      if (now && now >= s.held.until) return "the hold has ended, so the spend can only be released now";
      if (!tryTarget(s, t)) return t === "unclear" ? "there is no other counted signature to cite a page against" : "Mara's reading is not one of the two counted, so there is no signature of hers to strike";
      if (!done(s, "deposit")) return "put up the bond credit first";
      if (BigInt(s.credit || "0") < CHALLENGE_BOND_ATTO) return "your bond credit is under the 0.05 GEN a challenge stakes; deposit more first";
      return visitorBusy(s, id) ? "one of your calls is still with the network" : "";
    }
    case "withdraw":
      if (!done(s, "deposit") || BigInt(s.credit || "0") < 1n) return "you hold no bond credit";
      return visitorBusy(s, id) ? "one of your calls is still with the network" : "";
  }
}

/** The page-held actions that may be worked on now, in the order they are started. */
export function nextHeld(s: CatchState, now: number, nowMs: number): ActionId[] {
  return heldNext(s, ACTIONS, (id) => isVisitorAction(id as ActionId), (id) => blocked(s, id as ActionId, now), nowMs) as ActionId[];
}

export { SIGN_ACTION };

// ---- the rows the page shows -------------------------------------------------------------

export type RowId = "accounts" | "desk" | "spend" | "signs" | "bond" | "catch";
export const ROWS: { id: RowId; actions: ActionId[] }[] = [
  { id: "accounts", actions: ["fundInes", "fundMara", "fundTomas", "fundElin"] },
  { id: "desk", actions: ["open", "enrolInes", "enrolMara", "enrolTomas", "enrolElin"] },
  { id: "spend", actions: ["post"] },
  { id: "signs", actions: ["signMara", "signTomas", "signElin"] },
  { id: "bond", actions: ["deposit"] },
  { id: "catch", actions: ["catchIt"] },
];

export type RowPhase = Phase | "recused";

/** One state for a row, from the actions in it. */
export function rowPhase(s: CatchState, row: RowId): RowPhase {
  const ids = ROWS.find((r) => r.id === row)!.actions.filter((id) => {
    if (id === "signElin") return reserveNeeded(s) || s.actions.signElin.phase !== "waiting";
    return true;
  });
  const phases = ids.map((id) => s.actions[id].phase);
  for (const p of ["stopped", "refused", "signing", "onchain", "checking"] as Phase[]) if (phases.includes(p)) return p;
  if (phases.every((p) => p === "done")) {
    // Settled, but Mara's signature is not one of the two counted: there is nothing of hers to strike.
    if (row === "signs" && !maraCounted(s)) return "recused";
    return "done";
  }
  return "waiting";
}
