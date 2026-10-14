// The contract's interface, and nothing else: every method name, argument order, view shape,
// token, limit and refusal rule of contracts/recused.py that the site depends on is written here
// and nowhere else. No network, no React and no value import, so node runs it as it is and the
// unit tests check it against the contract source (tests/unit/contract-interface.test.mjs).
//
// lib/chain.ts re-exports all of it and adds the transport (reads through Studio, writes through
// the wallet or a page-held key). lib/chain-mock.ts stands in for the contract in demo mode and
// answers in the contract's own JSON shapes, so the mappers below run in both modes.

// ---- the contract's closed vocabulary and its limits ---------------------------------

/** The limits written into the contract. The live values come from rule() through readLimits(). */
export type Limits = {
  statement: [number, number];
  entries: [number, number];
  entryName: [number, number];
  entryDetail: number;
  otherDetail: number;
  declared: number;
  description: [number, number];
  identification: [number, number];
  identsPerSpend: number;
  label: [number, number];
  roster: [number, number];
  membersPerDesk: number;
  membersToPost: number;
  openSpendsPerDesk: number;
  /** the most spends one member may have open at once */
  openSpendsPerPoster: number;
  noticeMinutes: [number, number];
  liveMinutes: number;
  windowMinutes: number;
  refusalsKept: number;
  /** version 2: how long a carried spend waits, open to challenge, before it pays */
  holdMinutes: [number, number];
  /** version 2: how many register prefixes a desk names, and the characters of one */
  registries: [number, number];
  registryChars: number;
  registriesJsonChars: number;
  /** version 2: the characters of a cited page address */
  urlChars: number;
  /** version 2: the public name a member enrols under */
  publicName: [number, number];
  /** version 2: the most challenges challenges_of returns in one page */
  challengesPage: number;
};

export const LIMITS: Limits = {
  statement: [24, 600],
  entries: [1, 6],
  entryName: [3, 80],
  entryDetail: 160,
  otherDetail: 12,
  declared: 6,
  description: [16, 400],
  identification: [8, 200],
  identsPerSpend: 4,
  label: [4, 60],
  roster: [3, 20],
  membersPerDesk: 20,
  membersToPost: 3,
  openSpendsPerDesk: 8,
  openSpendsPerPoster: 2,
  noticeMinutes: [5, 1440],
  liveMinutes: 10,
  windowMinutes: 20160,
  refusalsKept: 12,
  holdMinutes: [5, 10080],
  registries: [1, 3],
  registryChars: 120,
  registriesJsonChars: 420,
  urlChars: 200,
  publicName: [3, 60],
  challengesPage: 20,
};

const GEN = 10n ** 18n;
/** The member stake a desk may ask, in atto: 0.1 GEN to 100 GEN (MIN_STAKE, MAX_STAKE). */
export const STAKE_ATTO: [bigint, bigint] = [GEN / 10n, 100n * GEN];
/** The bond every challenge that is read stakes from bond credit: 0.05 GEN (CHALLENGE_BOND). */
export const CHALLENGE_BOND_ATTO = GEN / 20n;

/** The closed relation catalogue, in the contract's order, with the phrase the contract prints for each. */
export const RELATIONS: { token: string; phrase: string; label: string }[] = [
  { token: "owns", phrase: "the member owns it", label: "I own it" },
  { token: "part_owns", phrase: "the member owns part of it", label: "I own part of it" },
  { token: "officer_of", phrase: "the member is an officer or a director of it", label: "I am an officer or a director of it" },
  { token: "employed_by", phrase: "the member is employed by it", label: "I am employed by it" },
  { token: "member_of", phrase: "the member belongs to it", label: "I belong to it" },
  { token: "family", phrase: "the member is related by family to it, or to whoever runs it", label: "Family runs it, or is it" },
  { token: "supplies", phrase: "the member supplies it with goods or services", label: "I supply it" },
  { token: "buys_from", phrase: "the member buys goods or services from it", label: "I buy from it" },
  { token: "landlord_of", phrase: "the member is its landlord", label: "I am its landlord" },
  { token: "tenant_of", phrase: "the member rents from it", label: "I rent from it" },
  { token: "lends_to", phrase: "the member has lent money to it", label: "I have lent it money" },
  { token: "owes_to", phrase: "the member owes money to it", label: "I owe it money" },
  { token: "volunteers_for", phrase: "the member does unpaid work for it", label: "I do unpaid work for it" },
  { token: "competes_with", phrase: "the member competes with it", label: "I compete with it" },
  { token: "other", phrase: "the member has some other relation to it, in their own words below", label: "Another relation (say which)" },
];
export const RELATION_OTHER = "other";

/** The seven characters a stored value is made of, and the contract's phrase for each. */
export const TOKEN_PHRASE: Record<string, string> = {
  G: "something the member filed is better off",
  L: "something the member filed is worse off",
  U: "nothing the member filed is moved",
  "?": "the reading could not say whether anything the member filed is moved",
  "/": "the two presentation orders gave different directions",
  x: "the answer could not be read",
  "-": "no model was asked",
};

export type Verdict = "clear" | "interested" | "unclear" | "declared" | "late" | "standing" | "";
export const VERDICTS: Verdict[] = ["clear", "interested", "unclear", "declared", "late", "standing"];
/** "holding" is version 2: two clear readings are counted and the hold runs; the amount stays committed. */
export type SpendState = "open" | "holding" | "paid" | "expired";
export const SPEND_STATES: SpendState[] = ["open", "holding", "paid", "expired"];

/** What a register round can find, and "repeat" for a page text already read against that signature. */
export type ChallengeVerdict = "hidden" | "clean" | "unclear" | "repeat";
export const CHALLENGE_VERDICTS: ChallengeVerdict[] = ["hidden", "clean", "unclear", "repeat"];

// ---- the door checks, as the contract makes them ----------------------------------------
// The contract refuses these before anything is stored; the pages make the same checks first so a
// visitor is told before signing. Each mirrors one helper of contracts/recused.py by name.

/** _text_problem: printable ASCII on one line, with no angle bracket and no double quote. */
export function textProblem(text: string, least: number, most: number, what: string): string {
  if (text.length < least || text.length > most) return `${what} is ${least} to ${most} characters (this one is ${text.length}).`;
  for (const ch of text) {
    if (ch === "<" || ch === ">") return `${what} may not contain < or >; write the comparison in words.`;
    if (ch === '"') return `${what} may not contain a double quote, because the fund prints your words inside double quotes; use an apostrophe.`;
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return `${what} is plain keyboard characters on one line (no accents, no emoji, no line breaks).`;
  }
  return "";
}

/** _name_problem: the door's text rule, and at least one letter. */
export function publicNameProblem(name: string): string {
  const p = textProblem(name, LIMITS.publicName[0], LIMITS.publicName[1], "The public name");
  if (p) return p;
  if (!/[A-Za-z]/.test(name)) return "The public name is the name a public register would list you under, so it holds letters.";
  return "";
}

const URL_SCHEME = "https://";

/**
 * _url_problem: https only, a lowercase host with a dot in it, then a path of letters, digits and
 * - . _ ~ / with no empty, "." or ".." segment: no query, no fragment, no port, no credentials.
 */
export function urlProblem(url: string, most: number, what: string): string {
  if (url.length > most) return `${what} is at most ${most} characters.`;
  if (!url.startsWith(URL_SCHEME)) return `${what} starts with ${URL_SCHEME}.`;
  const rest = url.slice(URL_SCHEME.length);
  const bare = rest.replace(/[-._~/]/g, "");
  if (!/^[\x00-\x7f]*$/.test(rest) || !(bare === "" || /^[A-Za-z0-9]+$/.test(bare)))
    return `${what} uses only letters, digits and - . _ ~ / after ${URL_SCHEME}.`;
  const slash = rest.indexOf("/");
  const host = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? "" : rest.slice(slash + 1);
  if (slash < 0 || !host.includes(".") || host !== host.toLowerCase() || host.startsWith(".") || host.endsWith("."))
    return `${what} names a lowercase host such as registry.example, then a path.`;
  if (rest.includes("//") || ("/" + path + "/").includes("/./") || ("/" + path + "/").includes("/../"))
    return `${what} has no empty, "." or ".." segment.`;
  return "";
}

/** _registries_problem, from the list the page holds: why not, or "" and the JSON the call carries. */
export function registriesProblem(list: string[]): { problem: string; json: string; prefixes: string[] } {
  const prefixes = list.map((p) => p.trim()).filter(Boolean);
  const json = JSON.stringify(prefixes);
  const [least, most] = LIMITS.registries;
  if (json.length > LIMITS.registriesJsonChars) return { problem: `The registers are at most ${LIMITS.registriesJsonChars} characters of JSON.`, json, prefixes };
  if (prefixes.length < least || prefixes.length > most) return { problem: `Name ${least} to ${most} registers, one address prefix each.`, json, prefixes };
  const seen = new Set<string>();
  for (const p of prefixes) {
    const problem = urlProblem(p, LIMITS.registryChars, "A register prefix");
    if (problem) return { problem, json, prefixes };
    if (!p.endsWith("/")) return { problem: "A register prefix ends with /, so it names a whole directory of pages.", json, prefixes };
    if (seen.has(p)) return { problem: "The registers name the same prefix twice.", json, prefixes };
    seen.add(p);
  }
  return { problem: "", json, prefixes };
}

/** _under: the address names a page below one of the prefixes, and not the prefix itself. */
export const under = (url: string, prefixes: string[]): boolean => prefixes.some((p) => url.startsWith(p) && url.length > p.length);

/** The checks challenge() makes on a cited address before any page is fetched; "" when it may be cited. */
export function pageProblem(url: string, prefixes: string[]): string {
  const p = urlProblem(url, LIMITS.urlChars, "The page address");
  if (p) return p;
  if (!under(url, prefixes)) return "The page is not below one of the registers this desk named when it was opened; only those are read.";
  return "";
}

// ---- types the pages use -----------------------------------------------------

/** Chain seconds as the view reported them, with the moment this browser received the answer. */
export type Stamped = { chainNow: number; readAtMs: number };

export type DeskRow = {
  id: string; // "D1"
  label: string;
  potAtto: string;
  members: number;
  openSpends: number;
  openEnrolment: boolean;
  /** the least notice, in minutes, a spend on this desk must give; fixed when the desk was opened */
  minNoticeMinutes: number;
  /** version 2: what every member stakes to sign, and how long a carried spend waits; 0 on a version 1 register */
  memberStakeAtto: string;
  holdMinutes: number;
};
export type DeskList = { count: number; first: number; rows: DeskRow[] };

export type Desk = Stamped & {
  id: string;
  label: string;
  opener: string;
  roster: string[];
  openEnrolment: boolean;
  potAtto: string;
  committedAtto: string;
  /** what the desk may still commit or pay back: the pot, less what is committed and what expired spends owe */
  freeAtto: string;
  /** what funders who reclaimed left behind on spends that are still open */
  claimsOpenAtto: string;
  /** what expired spends owe funders who had reclaimed; kept out of the free balance until each takes it */
  claimsDueAtto: string;
  drawnAtto: string;
  fundedTotal: string;
  members: number;
  spends: number;
  openSpends: number;
  paid: number;
  expired: number;
  readings: number;
  refusals: number;
  openedAt: number;
  openedSeq: number;
  fundRound: number;
  seqNow: number;
  /** the least notice, in minutes, a spend on this desk must give; fixed when the desk was opened */
  minNoticeMinutes: number;
  /** 2 when the register answered with version 2's fields, 1 otherwise */
  version: 1 | 2;
  /** the public registers a challenge may cite, fixed when the desk was opened */
  registries: string[];
  memberStakeAtto: string;
  holdMinutes: number;
  /** every member stake held on this desk */
  stakedAtto: string;
  /** the halves of slashed stakes that came into the pot */
  slashedInAtto: string;
  /** spends in their hold now */
  holding: number;
  challenges: number;
  hidden: number;
  cleared: number;
  unclear: number;
};

export type MemberRow = {
  number: string; // "M2"
  who: string;
  filedSeq: number;
  version: number;
  entryCount: number;
  declaredCount: number;
  digest: string;
  /** how many spends this member posted that are still open */
  openPosted: number;
  /** version 2: the name a public register would list them under, as they gave it */
  publicName: string;
  stakeAtto: string;
  /** spends in their hold on which this member's reading is counted */
  holdsOpen: number;
  /** the public record: signatures struck by a register page, and challenges a page did not bear out */
  hidden: number;
  cleared: number;
  retired: boolean;
};
export type Entry = { name: string; relation: string; relationPhrase: string; detail: string };
export type Member = MemberRow & {
  desk: string;
  statement: string;
  entries: Entry[];
  declared: string[];
  filedAt: number;
  /** the stake equals the desk's member stake, so the member may countersign */
  stakeWhole: boolean;
  /** spends not yet ended on which this member's reading is counted */
  signedOpen: number;
};

export type SpendRow = {
  desk: string;
  n: number;
  label: string; // "S4"
  payee: string;
  amountAtto: string;
  state: SpendState;
  approvals: number;
  idents: number;
  attempts: number;
  noticeUntil: number;
  windowUntil: number;
  /** "" when the row did not carry it */
  poster: string;
  /**
   * The gate of the spend's run: the sequence number of the first spend posted to this payee
   * address since the last one that was paid. A disclosure filed above it is late for this spend.
   */
  gateSeq: number;
  /** which run of spends to this payee address the spend belongs to, counted from 1 */
  run: number;
  /** version 2: when the latest hold ends; 0 before any hold */
  holdUntil: number;
  /** counted readings struck by a register page, and challenges read on this spend */
  struck: number;
  challenges: number;
};
export type SpendList = Stamped & { desk: string; count: number; first: number; rows: SpendRow[] };

export type Spend = SpendRow &
  Stamped & {
    poster: string;
    description: string;
    digest: string;
    docDigest: string;
    postedSeq: number;
    postedAt: number;
    approver1: string;
    approver2: string;
    approver1Value: string;
    approver2Value: string;
    posterDeclared: boolean;
    paidAt: number;
    expiredAt: number;
    /** members turned away from identifying the payee after the places were taken */
    shutOut: number;
    /** how many times the poster tried to countersign their own spend */
    posterTried: number;
    /** version 2: when the latest hold began, and how many times two clear readings put the spend in its hold */
    heldAt: number;
    holds: number;
  };

export type Reading = {
  desk: string;
  spend: string; // "S4"
  member: string; // address
  number: string; // "M2"
  attempt: number;
  value: string; // two characters
  ifDone: string;
  ifNot: string;
  verdict: Verdict;
  why: string;
  docDigest: string;
  identsSeen: number;
  filedSeq: number;
  postedSeq: number;
  /** the gate the disclosure was compared with (see SpendRow.gateSeq) */
  gateSeq: number;
  version: number;
  at: number;
  modelAsked: boolean;
  /** a "standing" refusal names the earlier reading that stands: its spend ("S3"), its pair and its verdict */
  standsOn: string;
  standsValue: string;
  standsVerdict: string;
  /** version 2: a counted reading a register page struck ("challenge 2"), or that its run struck */
  struck: boolean;
  struckBy: string;
  struckAt: number;
};

export type SpendDocument = Stamped & {
  desk: string;
  spend: string;
  text: string;
  /** the same lines as the second asking prints them: the identifications in the second order */
  textSecond: string;
  digest: string;
  sealedDigest: string;
  sealed: boolean;
  identificationsOpen: boolean;
  approvalsOpen: boolean;
};

/** `from` is the earlier spend ("S3") an identification was carried over from, "" when it was made on this one. */
export type Ident = { n: number; by: string; member: number; text: string; at: number; seq: number; digest: string; from: string };

/** The spends posted to one payee address on one desk since the last one that was paid. */
export type Run = { desk: string; payee: string; run: number; live: boolean; gateSeq: number; first: string; identifications: number };

export type Refusal = { desk: string; reason: string; seq: number; at: number; kind: string; by: string; spend: string };

/** A claim a funder who reclaimed still holds on one spend: void if it is paid, owed back if it expires. */
export type Claim = { spend: string; amountAtto: string; state: SpendState };

export type Credit = {
  desk: string;
  funder: string;
  credit: string;
  round: number;
  fundedTotal: string;
  potAtto: string;
  committedAtto: string;
  freeAtto: string;
  wouldPayAtto: string;
  reclaimableNow: boolean;
  openSpends: number;
  /** what expired spends owe this funder, included in wouldPayAtto */
  dueAtto: string;
  claims: Claim[];
};

/** One challenge read against a counted signature, as challenges_of returns it. */
export type Challenge = {
  n: number;
  desk: string;
  spend: string; // "S4"
  member: string; // "M2"
  memberAddr: string;
  publicName: string;
  challenger: string;
  url: string;
  /** what settled: the finding, or "repeat" when the page text was already read against that signature */
  verdict: ChallengeVerdict;
  /** what the round found, before the repeat check */
  readAs: ChallengeVerdict | "";
  /** the first 16 hex characters of the sha256 of the page text every validator judged */
  fp: string;
  repeatOf: number;
  /** which hold of the spend it was read in, counted from 1 */
  hold: number;
  at: number;
  bondAtto: string;
  /** who the bond went to: the member on clean, otherwise the challenger, whose credit kept it */
  bondTo: string;
  slashedAtto: string;
  bountyAtto: string;
  toDeskAtto: string;
  stateAfter: SpendState;
};
export type ChallengePage = Stamped & { desk: string; spend: string; count: number; offset: number; limit: number; rows: Challenge[]; state: SpendState; holdUntil: number };

export type BondCredit = { address: string; creditAtto: string; bondAtto: string; covered: number };

export type Stats = {
  desks: number;
  challenges: number;
  hidden: number;
  cleared: number;
  unclear: number;
  released: number;
  bondCreditAtto: string;
  bountiesPaidAtto: string;
  bondsToMembersAtto: string;
};

export type Votes = { agree: number; disagree: number; idle: number };
export type TxStatus = {
  status: string; // PENDING | PROPOSING | COMMITTING | REVEALING | ACCEPTED | FINALIZED | CANCELED | UNKNOWN
  votes: Votes;
  applied: boolean | null; // null until votes exist
  undetermined: boolean; // finished with no majority: nothing was stored
  exec: string | null; // SUCCESS | ERROR | null
  result: Record<string, unknown> | null; // the contract's JSON return, if any
  message: string; // raw decoded return / error text
};

export type ReadResult<T> = { data: T; source: "chain" | "mock" };

/**
 * The chain's clock now, in seconds, estimated from one view answer: the view's own "now" plus
 * the time this browser has counted since the answer arrived. Windows are compared with this
 * and not with the reader's clock, which can be minutes off. The reader's clock stands in when
 * the answer carried no readable "now".
 */
export function chainSeconds(o: Stamped | null | undefined, localNowMs: number = Date.now()): number {
  if (!o || !(o.chainNow > 0) || !(o.readAtMs > 0)) return Math.floor(localNowMs / 1000);
  return o.chainNow + Math.floor((localNowMs - o.readAtMs) / 1000);
}

/**
 * Which of its windows a spend is in, on the given clock. "holding" runs from the second clear
 * reading to hold_until, while anyone may cite a register page; "releasable" is a hold that has
 * ended, when anyone may release the payment.
 */
export type Phase = "notice" | "approvals" | "overdue" | "holding" | "releasable" | "paid" | "expired";
export const PHASES: Phase[] = ["notice", "approvals", "overdue", "holding", "releasable", "paid", "expired"];
export function phaseOf(s: Pick<SpendRow, "state" | "noticeUntil" | "windowUntil" | "holdUntil">, nowSeconds: number): Phase {
  if (s.state === "paid") return "paid";
  if (s.state === "expired") return "expired";
  if (s.state === "holding") return nowSeconds < s.holdUntil ? "holding" : "releasable";
  if (nowSeconds < s.noticeUntil) return "notice";
  if (nowSeconds < s.windowUntil) return "approvals";
  return "overdue";
}

// ---- ids ----------------------------------------------------------------------

/** "/spend/D1-S4" */
export const spendPath = (desk: string, n: number | string) => `/spend/${desk}-S${String(n).replace(/^S/i, "")}`;

/** "/member?desk=D1&addr=0x…": one member's page; without an address it is the visitor's own. */
export const memberPath = (desk: string, address = "") => `/member?desk=${desk}${address ? `&addr=${address.toLowerCase()}` : ""}`;

/** "D1-S4" (also "D1:S4" and "D1-4") into its desk and number; null for anything else. */
export function parseSpendId(id: string): { desk: string; n: number } | null {
  const m = /^(D[1-9]\d{0,8})[-:_]S?([1-9]\d{0,8})$/i.exec(decodeURIComponent(id ?? "").trim());
  if (!m) return null;
  return { desk: "D" + m[1].slice(1), n: Number(m[2]) };
}

// ---- row mappers (every missing field gets a default) ---------------------------

export type Row = Record<string, unknown>;
export type Arg = string | number;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return Number.isFinite(v) ? BigInt(Math.trunc(v)).toString() : "0";
  const s = str(v, "0").trim();
  return /^\d+$/.test(s) ? s : "0";
};
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1";
const addr = (v: unknown): string => str(v).toLowerCase();
const ZERO = "0x0000000000000000000000000000000000000000";
/** An address field that the contract fills with the zero address until somebody takes the slot. */
const addrOrBlank = (v: unknown): string => {
  const a = addr(v);
  return a === ZERO ? "" : a;
};
/** Seconds; the contract writes -1 when a call had no readable clock. */
const secs = (v: unknown): number => Math.max(0, num(v));

/** The field readers above, for lib/chain.ts's own reads. */
export const viewField = { num, str, atto, bool, addr, secs };

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
export function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
export const rowsOf = (v: unknown): Row[] => {
  const raw = typeof v === "string" ? parseView(v) : v;
  return (Array.isArray(raw) ? raw : [])
    .map((r) => (typeof r === "string" ? parseView(r) : r))
    .filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r));
};
export const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const strings = (v: unknown): string[] => {
  const raw = typeof v === "string" ? parseView(v) : v;
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
};

/** A view answered with nothing (an unknown id): null, "", {} or an {error} / {ok: false} shape. */
export const isEmptyRow = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "" || v === "null") return true;
  if (typeof v !== "object") return true;
  if (Array.isArray(v)) return false;
  const o = v as Row;
  if (Object.keys(o).length === 0) return true;
  if ("error" in o) return true;
  if (o.ok === false) return true;
  return false;
};

export function mapDeskRow(r: Row): DeskRow {
  return {
    id: str(r.desk ?? r.id),
    label: str(r.label),
    potAtto: atto(r.pot),
    members: num(r.members),
    openSpends: num(r.open_spends),
    openEnrolment: r.open_enrolment === undefined ? true : bool(r.open_enrolment),
    minNoticeMinutes: num(r.min_notice_minutes, LIMITS.noticeMinutes[0]),
    memberStakeAtto: atto(r.member_stake),
    holdMinutes: num(r.hold_minutes),
  };
}

export function mapDesk(r: Row, id: string, at: number): Desk {
  const roster = strings(r.roster).map((a) => a.toLowerCase());
  const pot = atto(r.pot);
  const committed = atto(r.committed);
  return {
    id: str(r.desk ?? id),
    label: str(r.label),
    opener: addr(r.opener),
    roster,
    openEnrolment: r.open_enrolment === undefined ? roster.length === 0 : bool(r.open_enrolment),
    potAtto: pot,
    committedAtto: committed,
    freeAtto: r.free === undefined ? (BigInt(pot) - BigInt(committed)).toString() : atto(r.free),
    claimsOpenAtto: atto(r.claims_open),
    claimsDueAtto: atto(r.claims_due),
    drawnAtto: atto(r.drawn),
    fundedTotal: atto(r.funded_total),
    members: num(r.members),
    spends: num(r.spends),
    openSpends: num(r.open_spends),
    paid: num(r.paid),
    expired: num(r.expired),
    readings: num(r.readings),
    refusals: num(r.refusals),
    openedAt: secs(r.opened_at),
    openedSeq: num(r.opened_seq),
    fundRound: num(r.fund_round, 1),
    seqNow: num(r.seq_now),
    minNoticeMinutes: num(r.min_notice_minutes, LIMITS.noticeMinutes[0]),
    version: r.member_stake === undefined ? 1 : 2,
    registries: strings(r.registries),
    memberStakeAtto: atto(r.member_stake),
    holdMinutes: num(r.hold_minutes),
    stakedAtto: atto(r.staked),
    slashedInAtto: atto(r.slashed_in),
    holding: num(r.holding),
    challenges: num(r.challenges),
    hidden: num(r.hidden),
    cleared: num(r.cleared),
    unclear: num(r.unclear),
    chainNow: secs(r.now),
    readAtMs: at,
  };
}

export function mapMemberRow(r: Row): MemberRow {
  return {
    number: str(r.member ?? r.number),
    who: addr(r.who),
    filedSeq: num(r.filed_seq),
    version: num(r.version, 1),
    entryCount: num(r.n_entries),
    declaredCount: num(r.n_declared),
    digest: str(r.digest),
    openPosted: num(r.open_spends_posted),
    publicName: str(r.public_name),
    stakeAtto: atto(r.stake),
    holdsOpen: num(r.holds_open),
    hidden: num(r.hidden),
    cleared: num(r.cleared),
    retired: bool(r.retired),
  };
}

const phraseOf = (token: string): string => RELATIONS.find((x) => x.token === token)?.phrase ?? token;

export function mapMember(r: Row, desk: string): Member {
  const entries = rowsOf(r.entries).map((e) => ({
    name: str(e.name),
    relation: str(e.relation),
    relationPhrase: str(e.relation_phrase) || phraseOf(str(e.relation)),
    detail: str(e.detail),
  }));
  const declared = strings(r.declared).map((a) => a.toLowerCase());
  return {
    ...mapMemberRow(r),
    entryCount: r.n_entries === undefined ? entries.length : num(r.n_entries),
    declaredCount: r.n_declared === undefined ? declared.length : num(r.n_declared),
    desk: str(r.desk ?? desk),
    statement: str(r.statement),
    entries,
    declared,
    filedAt: secs(r.filed_at),
    // A version 1 register has no stake: every member of it may sign.
    stakeWhole: r.stake_whole === undefined ? true : bool(r.stake_whole),
    signedOpen: num(r.signed_open),
  };
}

const stateOf = (v: unknown): SpendState => {
  const s = str(v, "open");
  return (SPEND_STATES as string[]).includes(s) ? (s as SpendState) : "open";
};
const spendNumber = (v: unknown, dflt = 0): number => num(str(v).replace(/^S/i, ""), dflt);

export function mapSpendRow(r: Row, desk: string): SpendRow {
  const n = spendNumber(r.spend ?? r.number);
  return {
    desk: str(r.desk ?? desk),
    n,
    label: "S" + n,
    payee: addr(r.payee),
    amountAtto: atto(r.amount),
    state: stateOf(r.state),
    approvals: num(r.approvals),
    idents: num(r.n_idents),
    attempts: num(r.n_attempts),
    noticeUntil: secs(r.notice_until),
    windowUntil: secs(r.window_until),
    poster: addr(r.poster),
    // A register from before runs existed has no gate: the spend's own number is the gate then.
    gateSeq: num(r.gate_seq, num(r.posted_seq)),
    run: num(r.run, 1),
    holdUntil: secs(r.hold_until),
    struck: num(r.struck),
    challenges: num(r.challenges),
  };
}

export function mapSpend(r: Row, desk: string, at: number): Spend {
  return {
    ...mapSpendRow(r, desk),
    poster: addr(r.poster),
    description: str(r.description),
    digest: str(r.digest),
    docDigest: str(r.doc_digest),
    postedSeq: num(r.posted_seq),
    postedAt: secs(r.posted_at),
    approver1: addrOrBlank(r.approver1),
    approver2: addrOrBlank(r.approver2),
    approver1Value: str(r.approver1_value),
    approver2Value: str(r.approver2_value),
    posterDeclared: bool(r.poster_declared),
    paidAt: secs(r.paid_at),
    expiredAt: secs(r.expired_at),
    shutOut: num(r.shut_out),
    posterTried: num(r.poster_tried),
    heldAt: secs(r.held_at),
    holds: num(r.holds),
    chainNow: secs(r.now),
    readAtMs: at,
  };
}

const verdictOf = (v: unknown): Verdict => {
  const s = str(v) as Verdict;
  return VERDICTS.includes(s) ? s : "";
};

export function mapReading(r: Row): Reading {
  const value = str(r.value);
  return {
    desk: str(r.desk),
    spend: str(r.spend),
    member: addr(r.member),
    number: str(r.number),
    attempt: num(r.attempt),
    value,
    ifDone: str(r.ifdone) || value.slice(0, 1),
    ifNot: str(r.ifnot) || value.slice(1, 2),
    verdict: verdictOf(r.verdict),
    why: str(r.why),
    docDigest: str(r.doc_digest),
    identsSeen: num(r.idents_seen),
    filedSeq: num(r.filed_seq),
    postedSeq: num(r.posted_seq),
    gateSeq: num(r.gate_seq, num(r.posted_seq)),
    version: num(r.version, 1),
    at: secs(r.at),
    modelAsked: r.model_asked === undefined ? value !== "--" : bool(r.model_asked),
    standsOn: str(r.stands_on),
    standsValue: str(r.stands_value),
    // A standing row's earlier verdict may be "struck", which no reading verdict is.
    standsVerdict: str(r.stands_verdict),
    struck: bool(r.struck),
    struckBy: str(r.struck_by),
    struckAt: secs(r.struck_at),
  };
}

export function mapDocument(r: Row, at: number): SpendDocument {
  const sealedDigest = str(r.sealed_digest);
  return {
    desk: str(r.desk),
    spend: str(r.spend),
    text: str(r.document),
    textSecond: str(r.document_in_second_order),
    digest: str(r.digest),
    sealedDigest,
    sealed: r.sealed === undefined ? !!sealedDigest : bool(r.sealed),
    identificationsOpen: bool(r.identifications_open),
    approvalsOpen: bool(r.approvals_open),
    chainNow: secs(r.now),
    readAtMs: at,
  };
}

export function mapIdent(r: Row): Ident {
  return {
    n: num(r.n),
    by: addr(r.by),
    member: num(str(r.member).replace(/^M/i, "")),
    text: str(r.text),
    at: secs(r.at),
    seq: num(r.seq),
    digest: str(r.digest),
    from: str(r.from),
  };
}

export function mapRefusal(r: Row): Refusal {
  return {
    desk: str(r.desk),
    reason: str(r.reason),
    seq: num(r.seq),
    at: secs(r.at),
    kind: str(r.kind, "procedural"),
    by: addr(r.by),
    spend: str(r.spend),
  };
}

export function mapCredit(r: Row, desk: string, who: string): Credit {
  return {
    desk: str(r.desk ?? desk),
    funder: addr(r.funder ?? who),
    credit: atto(r.credit),
    round: num(r.round, 1),
    fundedTotal: atto(r.funded_total),
    potAtto: atto(r.pot),
    committedAtto: atto(r.committed),
    freeAtto: atto(r.free),
    wouldPayAtto: atto(r.would_pay),
    reclaimableNow: bool(r.reclaimable_now),
    openSpends: num(r.open_spends),
    dueAtto: atto(r.due_from_expired),
    claims: rowsOf(r.claims).map((c) => ({ spend: str(c.spend), amountAtto: atto(c.amount), state: stateOf(c.state) })),
  };
}

const challengeVerdictOf = (v: unknown): ChallengeVerdict | "" => {
  const s = str(v) as ChallengeVerdict;
  return CHALLENGE_VERDICTS.includes(s) ? s : "";
};

export function mapChallenge(r: Row): Challenge {
  return {
    n: num(r.n),
    desk: str(r.desk),
    spend: str(r.spend),
    member: str(r.member),
    memberAddr: addr(r.member_addr),
    publicName: str(r.public_name),
    challenger: addr(r.challenger),
    url: str(r.url),
    verdict: challengeVerdictOf(r.verdict) || "unclear",
    readAs: challengeVerdictOf(r.read_as),
    fp: str(r.fp),
    repeatOf: num(r.repeat_of),
    hold: num(r.hold),
    at: secs(r.at),
    bondAtto: atto(r.bond),
    bondTo: addr(r.bond_to),
    slashedAtto: atto(r.slashed),
    bountyAtto: atto(r.bounty),
    toDeskAtto: atto(r.to_desk),
    stateAfter: stateOf(r.state_after),
  };
}

export function mapChallengePage(r: Row, desk: string, at: number): ChallengePage {
  return {
    desk: str(r.desk ?? desk),
    spend: str(r.spend),
    count: num(r.count),
    offset: num(r.offset),
    limit: num(r.limit, LIMITS.challengesPage),
    rows: rowsOf(r.rows).map(mapChallenge),
    state: stateOf(r.state),
    holdUntil: secs(r.hold_until),
    chainNow: secs(r.now),
    readAtMs: at,
  };
}

export function mapBondCredit(r: Row, who: string): BondCredit {
  return { address: addr(r.address ?? who), creditAtto: atto(r.bond_credit), bondAtto: atto(r.bond ?? CHALLENGE_BOND_ATTO.toString()), covered: num(r.challenges_covered) };
}

export function mapStats(r: Row): Stats {
  return {
    desks: num(r.desks),
    challenges: num(r.challenges),
    hidden: num(r.hidden),
    cleared: num(r.cleared),
    unclear: num(r.unclear),
    released: num(r.released),
    bondCreditAtto: atto(r.bond_credit),
    bountiesPaidAtto: atto(r.bounties_paid),
    bondsToMembersAtto: atto(r.bonds_to_members),
  };
}

const pair = (v: unknown, dflt: [number, number]): [number, number] =>
  Array.isArray(v) && v.length === 2 ? [num(v[0], dflt[0]), num(v[1], dflt[1])] : dflt;

/** rule().limits over the defaults above, so a limit the contract changed shows without a site edit. */
export function mapLimits(rule: Row): Limits {
  const l = asRow(rule.limits);
  return {
    ...LIMITS,
    statement: pair(l.statement, LIMITS.statement),
    entries: pair(l.entries, LIMITS.entries),
    entryName: pair(l.entry_name, LIMITS.entryName),
    entryDetail: num(l.entry_detail, LIMITS.entryDetail),
    otherDetail: num(l.other_detail, LIMITS.otherDetail),
    declared: num(l.declared_addresses, LIMITS.declared),
    description: pair(l.description, LIMITS.description),
    identification: pair(l.identification, LIMITS.identification),
    identsPerSpend: num(l.identifications_per_spend, LIMITS.identsPerSpend),
    membersPerDesk: num(l.members_per_desk, LIMITS.membersPerDesk),
    membersToPost: num(l.members_to_post, LIMITS.membersToPost),
    openSpendsPerDesk: num(l.open_spends_per_desk, LIMITS.openSpendsPerDesk),
    openSpendsPerPoster: num(l.open_spends_per_poster, LIMITS.openSpendsPerPoster),
    noticeMinutes: pair(l.notice_minutes, LIMITS.noticeMinutes),
    liveMinutes: num(l.live_minutes_after_notice, LIMITS.liveMinutes),
    windowMinutes: num(l.window_minutes, LIMITS.windowMinutes),
    refusalsKept: num(l.refusals_kept, LIMITS.refusalsKept),
    holdMinutes: pair(l.hold_minutes, LIMITS.holdMinutes),
    registries: pair(l.registries, LIMITS.registries),
    registryChars: num(l.registry_prefix_characters, LIMITS.registryChars),
    urlChars: num(l.page_address_characters, LIMITS.urlChars),
    publicName: pair(l.public_name, LIMITS.publicName),
    challengesPage: num(l.rows_per_page, LIMITS.challengesPage),
  };
}

/** The register's contract version, from rule(): version 2 publishes its register round there. */
export const versionOfRule = (rule: Row): 1 | 2 => ("register" in rule ? 2 : 1);

// ---- writes: one builder per method ----------------------------------------------

export type WriteFn =
  | "open_desk"
  | "fund"
  | "enrol"
  | "amend"
  | "post_spend"
  | "identify"
  | "approve"
  | "expire"
  | "reclaim"
  | "restake"
  | "retire"
  | "withdraw_stake"
  | "release"
  | "deposit"
  | "withdraw"
  | "challenge";

/** Every write the site makes, in the contract's own order of definition. */
export const WRITE_FNS: WriteFn[] = [
  "open_desk", "fund", "enrol", "restake", "retire", "withdraw_stake", "amend", "post_spend", "identify", "approve", "expire",
  "reclaim", "release", "deposit", "withdraw", "challenge",
];

/** The writes that take value: every refusal of these returns what was sent and answers ok: false. */
export const PAYABLE_FNS: WriteFn[] = ["open_desk", "fund", "enrol", "restake", "deposit"];

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

export type EntryInput = { name: string; relation: string; detail: string };
const entriesJson = (entries: EntryInput[]) =>
  JSON.stringify(entries.map((e) => ({ name: e.name.trim(), relation: e.relation, detail: e.detail.trim() })));
const csv = (addresses: string[]) => addresses.map((a) => a.trim().toLowerCase()).filter(Boolean).join(",");

/** "M3" from "M3", "m3" or 3. */
export const memberNo = (m: string | number): string => "M" + String(m).replace(/^M/i, "").trim();

export const calls = {
  /**
   * open_desk(label, roster_csv, min_notice_minutes, registries_json, member_stake, hold_minutes),
   * payable: the value sent is the desk's first funding. The last four are fixed for good: the
   * least notice any spend must give, the public registers a challenge may cite, what every member
   * stakes (atto, as a decimal string) and how long a carried spend waits before it pays.
   */
  openDesk: (
    label: string,
    roster: string[],
    valueAtto: bigint,
    minNoticeMinutes: number,
    registries: string[],
    memberStakeAtto: bigint,
    holdMinutes: number,
  ): Call => ({
    fn: "open_desk",
    args: [label.trim(), csv(roster), Math.trunc(minNoticeMinutes), JSON.stringify(registries.map((p) => p.trim()).filter(Boolean)), memberStakeAtto.toString(), Math.trunc(holdMinutes)],
    value: valueAtto,
  }),
  /** fund(desk), payable. */
  fund: (desk: string, valueAtto: bigint): Call => ({ fn: "fund", args: [desk], value: valueAtto }),
  /** enrol(desk, statement, entries_json, addresses_csv, public_name), payable with exactly the desk's member stake. */
  enrol: (desk: string, statement: string, entries: EntryInput[], addresses: string[], publicName: string, stakeAtto: bigint): Call => ({
    fn: "enrol",
    args: [desk, statement.trim(), entriesJson(entries), csv(addresses), publicName.trim()],
    value: stakeAtto,
  }),
  /** restake(desk), payable with exactly the amount the member's stake is missing. */
  restake: (desk: string, missingAtto: bigint): Call => ({ fn: "restake", args: [desk], value: missingAtto }),
  /** retire(desk): stop countersigning on the desk, for good. */
  retire: (desk: string): Call => ({ fn: "retire", args: [desk] }),
  /** withdraw_stake(desk): a retired member takes the stake back once nothing it signed is open or in its hold. */
  withdrawStake: (desk: string): Call => ({ fn: "withdraw_stake", args: [desk] }),
  /** amend(desk, statement, entries_json, addresses_csv) */
  amend: (desk: string, statement: string, entries: EntryInput[], addresses: string[]): Call => ({
    fn: "amend",
    args: [desk, statement.trim(), entriesJson(entries), csv(addresses)],
  }),
  /** post_spend(desk, payee, amount, description, notice_minutes, window_minutes) */
  postSpend: (desk: string, payee: string, amountAtto: bigint, description: string, noticeMinutes: number, windowMinutes: number): Call => ({
    fn: "post_spend",
    args: [desk, payee.trim().toLowerCase(), amountAtto.toString(), description.trim(), Math.trunc(noticeMinutes), Math.trunc(windowMinutes)],
  }),
  /** identify(desk, spend, text) */
  identify: (desk: string, n: number, text: string): Call => ({ fn: "identify", args: [desk, String(n), text.trim()] }),
  /** approve(desk, spend): the countersignature */
  approve: (desk: string, n: number): Call => ({ fn: "approve", args: [desk, String(n)] }),
  /** expire(desk, spend) */
  expire: (desk: string, n: number): Call => ({ fn: "expire", args: [desk, String(n)] }),
  /** reclaim(desk) */
  reclaim: (desk: string): Call => ({ fn: "reclaim", args: [desk] }),
  /** release(desk, spend): anyone, once the hold has ended; pays the payee. */
  release: (desk: string, n: number): Call => ({ fn: "release", args: [desk, String(n)] }),
  /** deposit(), payable: adds the value to the sender's bond credit. */
  deposit: (valueAtto: bigint): Call => ({ fn: "deposit", args: [], value: valueAtto }),
  /** withdraw(): the sender takes back all of its bond credit. */
  withdraw: (): Call => ({ fn: "withdraw", args: [] }),
  /** challenge(desk, spend, member_no, url): cite a register page against one counted signature. */
  challenge: (desk: string, n: number, member: string | number, url: string): Call => ({
    fn: "challenge",
    args: [desk, String(n), memberNo(member), url.trim()],
  }),
};

/** True for the calls the validators judge: the rail then shows their votes. */
export const isJudged = (fn: WriteFn) => fn === "approve" || fn === "challenge";

// ---- outcomes: what a finished call's JSON return means ----------------------------

const stripTag = (m: string) => m.replace(/^\s*\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*/i, "").trim();

/** The contract's reason for refusing a call, without its tag; "" when the call was not refused. */
export function refusalReason(s: TxStatus | null): string {
  if (!s) return "";
  const r = s.result;
  if (r && r.ok === false) return stripTag(str(r.reason) || str(r.why));
  if (s.exec === "ERROR") {
    const m = /\[EXPECTED\]\s*([^"}\n]+)/.exec(s.message || "");
    return m ? m[1].trim() : stripTag(s.message || "");
  }
  return "";
}

export type ApproveOutcome =
  /** the second clear reading: the spend is in its hold until holdUntil, and nothing is paid yet */
  | { kind: "holding"; reading: Reading; holdUntil: number; heldAt: number; dropped: string[] }
  /** the first clear reading: counted, one more needed */
  | { kind: "counted"; reading: Reading; dropped: string[] }
  /** a final refusal: the reading is stored and the attempt is spent */
  | { kind: "recused"; reading: Reading }
  /** a procedural refusal: nothing was read and the attempt is unspent */
  | { kind: "procedural"; reason: string }
  | { kind: "unknown" };

/** approve() never raises; every outcome is in its JSON return. */
export function approveOutcome(s: TxStatus | null): ApproveOutcome {
  const r = s?.result;
  if (!r) return { kind: "unknown" };
  if (r.ok === true) {
    const reading = mapReading(r);
    const dropped = strings(r.dropped);
    if (str(r.state) === "holding" || str(r.counted).startsWith("2") || num(r.approvals) >= 2)
      return { kind: "holding", reading, holdUntil: secs(r.hold_until), heldAt: secs(r.held_at), dropped };
    return { kind: "counted", reading, dropped };
  }
  if (r.ok === false) {
    if (verdictOf(r.verdict) && r.attempt_spent !== false) return { kind: "recused", reading: mapReading(r) };
    return { kind: "procedural", reason: stripTag(str(r.reason)) };
  }
  return { kind: "unknown" };
}

export type ReleaseOutcome =
  /** the payee was paid in this transaction, after the spend was latched paid */
  | { kind: "paid"; paidAtto: string; to: string; potAtto: string; challenges: number }
  /** a counted signature was struck on another spend of the run: it was dropped, nothing paid, back to open (or expired) */
  | { kind: "dropped"; dropped: string[]; state: SpendState; approvals: number; reason: string }
  /** raised before anything changed: not holding, or the hold has not ended */
  | { kind: "refused"; reason: string }
  | { kind: "unknown" };

export function releaseOutcome(s: TxStatus | null): ReleaseOutcome {
  if (!s) return { kind: "unknown" };
  const r = s.result;
  if (r && r.ok === true) return { kind: "paid", paidAtto: atto(r.paid), to: addr(r.to), potAtto: atto(r.pot), challenges: num(r.challenges) };
  if (r && r.ok === false && "dropped" in r)
    return { kind: "dropped", dropped: strings(r.dropped), state: stateOf(r.state), approvals: num(r.approvals), reason: stripTag(str(r.reason)) };
  if (s.exec === "ERROR") return { kind: "refused", reason: refusalReason(s) };
  return { kind: "unknown" };
}

export type ChallengeOutcome =
  /** read and settled in this transaction: the challenge row, and the spend and credit as they stand after it */
  | { kind: "settled"; challenge: Challenge; approvals: number; potAtto: string; bondCreditAtto: string }
  /** a rule of the contract refused it before any page was fetched; nothing changed and no bond was taken */
  | { kind: "refused"; reason: string }
  /**
   * The validators did not agree on a finding: the page could not be fetched, answered an error
   * status, read differently for some of them, or a model call failed. Nothing was stored and no
   * bond was taken; the same challenge may be made again.
   */
  | { kind: "unsettled" }
  | { kind: "unknown" };

export function challengeOutcome(s: TxStatus | null): ChallengeOutcome {
  if (!s) return { kind: "unknown" };
  if (s.undetermined || s.status === "CANCELED" || s.applied === false) return { kind: "unsettled" };
  const r = s.result;
  if (r && r.ok === true && "verdict" in r)
    return { kind: "settled", challenge: mapChallenge(r), approvals: num(r.approvals), potAtto: atto(r.pot), bondCreditAtto: atto(r.bond_credit) };
  if (s.exec === "ERROR") {
    const reason = refusalReason(s);
    // A leader whose fetch or model call failed is never agreed with; if such an error is what
    // came back, nothing was stored all the same.
    if (/\[(TRANSIENT|LLM_ERROR)\]/.test(s.message || "")) return { kind: "unsettled" };
    return { kind: "refused", reason };
  }
  return { kind: "unknown" };
}

/** post_spend's return: the spend it created, or null. */
export function postedSpend(
  s: TxStatus | null,
): { desk: string; n: number; noticeUntil: number; windowUntil: number; postedSeq: number; gateSeq: number } | null {
  const r = s?.result;
  if (!r || r.ok !== true || !r.spend) return null;
  return {
    desk: str(r.desk),
    n: spendNumber(r.spend),
    noticeUntil: secs(r.notice_until),
    windowUntil: secs(r.window_until),
    postedSeq: num(r.posted_seq),
    gateSeq: num(r.gate_seq, num(r.posted_seq)),
  };
}

/** open_desk's return: the desk it created, or null (a refusal returns the value sent). */
export function openedDesk(s: TxStatus | null): { desk: string; label: string; registries: string[]; memberStakeAtto: string; holdMinutes: number } | null {
  const r = s?.result;
  if (!r || r.ok !== true || !r.desk) return null;
  return { desk: str(r.desk), label: str(r.label), registries: strings(r.registries), memberStakeAtto: atto(r.member_stake), holdMinutes: num(r.hold_minutes) };
}

/** identify's return: true when the sentence was added to the spend's document. */
export function identified(s: TxStatus | null): boolean {
  const r = s?.result;
  return !!r && r.ok === true && "n" in r;
}

/**
 * True once the network has accepted a transaction and its result can be read. Studio applies
 * the state at ACCEPTED and finalizes about half a minute later; a call that follows another
 * may be sent from here on. Money a call moves still leaves only once it is FINALIZED.
 */
export function isAccepted(s: TxStatus | null): boolean {
  return !!s && (s.status === "ACCEPTED" || s.status === "FINALIZED") && s.applied === true && (s.result !== null || s.exec !== null);
}

/** True when nothing more will happen to the transaction (finalized, cancelled, or no majority). */
export function isSettled(s: TxStatus | null): boolean {
  return !!s && (s.undetermined || s.status === "FINALIZED" || s.status === "CANCELED" || s.status === "UNDETERMINED");
}

/** enrol's and amend's return: the member number, the sequence number, the version and (enrol) the stake. */
export function filedDisclosure(s: TxStatus | null): { member: string; filedSeq: number; version: number; publicName: string; stakeAtto: string } | null {
  const r = s?.result;
  if (!r || r.ok !== true || !r.member) return null;
  return { member: str(r.member), filedSeq: num(r.filed_seq), version: num(r.version, 1), publicName: str(r.public_name), stakeAtto: atto(r.stake) };
}

/** reclaim's return: what was paid back, in atto. */
export function reclaimed(s: TxStatus | null): string {
  const r = s?.result;
  return r && r.ok === true ? atto(r.reclaimed) : "0";
}

/** deposit's and withdraw's return: the bond credit left, in atto; null when the call did not do what was asked. */
export function bondCreditAfter(s: TxStatus | null): string | null {
  const r = s?.result;
  return r && r.ok === true && "bond_credit" in r ? atto(r.bond_credit) : null;
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if ("returned" in r || "reclaimed" in r || "sent" in r || "withdrawn" in r || "added" in r) return true;
  if ("paid" in r && atto(r.paid) !== "0") return true;
  if ("bounty" in r && (atto(r.bounty) !== "0" || str(r.bond_to) !== str(r.challenger))) return true;
  if (r.ok === true && "stake" in r && "public_name" in r) return true;
  return r.ok === true && "pot" in r && "opener" in r;
}
