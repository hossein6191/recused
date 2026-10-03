// Chain access for Recused: the ONE file that knows the contract's interface.
//
// Every method name, argument order, view shape, token and limit of contracts/recused.py that
// the site depends on is written here and nowhere else. Pages import typed reads, typed call
// builders and mapped outcomes from this module; when the contract's interface changes, this is
// the file to edit (and lib/chain-mock.ts, which stands in for the contract in mock mode and
// answers in the contract's own JSON shapes, so the mappers below run in both modes).
//
// Real implementation: genlayer-js against GenLayer Studio (chain 61999).
// Mock implementation (NEXT_PUBLIC_MOCK=1): lib/chain-mock.ts, an in-memory stand-in.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries
// over about forty seconds, because Studio answers "Contract not found" for a healthy contract
// for about a minute after a deploy. A failed read is never "no data" and never proof that a
// write failed. Studio allows 30 gen_call a minute from one browser (the faucet shares them),
// so every view answer is cached for 30 s, two components asking for the same view share one
// request, and invalidateReads() drops the cache once a transaction is final. A read call
// fails once its encoded calldata passes 256 bytes, so every view here takes ids, numbers and
// addresses only.

import * as mock from "./chain-mock";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { registerOverride, siteRegister } from "./register";
import {
  RATE_LIMITED,
  createReadCache,
  decodeTx,
  isMissingMethodError,
  noteFailure,
  rpc,
  sleep,
  waitForCooldown,
  withRetry,
  type RawTx,
} from "./rpc";
import { getChainId, getSigner, chainName } from "./wallet";

export { RATE_LIMITED, cooldownRemainingMs, waitForCooldown } from "./rpc";

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

/** The file /deploy serves and deploys: a byte copy of contracts/recused.py (tools/sync-contract.mjs). */
export const CONTRACT_SOURCE_PATH = "/contracts/recused.py";
export const CONTRACT_FILE = "contracts/recused.py";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
/** The register in use: this browser's choice from /deploy first, then the site's default. */
export const contractAddress = (): string => registerOverride() || siteRegister();

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads when the site has no register address yet. */
export const NO_REGISTER = "no register is configured yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED =
  "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

// ---- the contract's closed vocabulary ---------------------------------------

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
  roster: [3, 24],
  membersPerDesk: 24,
  membersToPost: 3,
  openSpendsPerDesk: 8,
  openSpendsPerPoster: 2,
  noticeMinutes: [5, 1440],
  liveMinutes: 10,
  windowMinutes: 20160,
  refusalsKept: 12,
};

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
export type SpendState = "open" | "paid" | "expired";

/** What every member text must be: printable ASCII on one line, with no angle bracket and no double quote. */
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
};
export type Entry = { name: string; relation: string; relationPhrase: string; detail: string };
export type Member = MemberRow & {
  desk: string;
  statement: string;
  entries: Entry[];
  declared: string[];
  filedAt: number;
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
  standsVerdict: Verdict;
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

/** Which of its windows a spend is in, on the given clock. */
export type Phase = "notice" | "approvals" | "overdue" | "paid" | "expired";
export function phaseOf(s: Pick<SpendRow, "state" | "noticeUntil" | "windowUntil">, nowSeconds: number): Phase {
  if (s.state === "paid") return "paid";
  if (s.state === "expired") return "expired";
  if (nowSeconds < s.noticeUntil) return "notice";
  if (nowSeconds < s.windowUntil) return "approvals";
  return "overdue";
}

// ---- ids ----------------------------------------------------------------------

/** "/spend/D1-S4" */
export const spendPath = (desk: string, n: number | string) => `/spend/${desk}-S${String(n).replace(/^S/i, "")}`;

/** "D1-S4" (also "D1:S4" and "D1-4") into its desk and number; null for anything else. */
export function parseSpendId(id: string): { desk: string; n: number } | null {
  const m = /^(D[1-9]\d{0,8})[-:_]S?([1-9]\d{0,8})$/i.exec(decodeURIComponent(id ?? "").trim());
  if (!m) return null;
  return { desk: "D" + m[1].slice(1), n: Number(m[2]) };
}

// ---- low-level view access --------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

type Row = Record<string, unknown>;
type Arg = string | number;

const num = (v: unknown, dflt = 0): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : dflt;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return dflt;
};
const str = (v: unknown, dflt = ""): string => (v === undefined || v === null ? dflt : String(v));
const atto = (v: unknown): string => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "number") return BigInt(Math.trunc(v)).toString();
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

/** A view returns a JSON string; parse it. Some decoders already hand back the object. */
function parseView(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
const rowsOf = (v: unknown): Row[] => {
  const raw = typeof v === "string" ? parseView(v) : v;
  return (Array.isArray(raw) ? raw : [])
    .map((r) => (typeof r === "string" ? parseView(r) : r))
    .filter((r): r is Row => !!r && typeof r === "object" && !Array.isArray(r));
};
const asRow = (v: unknown): Row => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {});
const strings = (v: unknown): string[] => {
  const raw = typeof v === "string" ? parseView(v) : v;
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
};

/** A view answered with nothing (an unknown id): null, "", {} or an {error} / {ok: false} shape. */
const isEmptyRow = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "" || v === "null") return true;
  if (typeof v !== "object") return true;
  if (Array.isArray(v)) return false;
  const o = v as Row;
  if (Object.keys(o).length === 0) return true;
  if ("error" in o) return true;
  if (o.ok === false) return true;
  return false;
};

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
type Answer = { raw: unknown; at: number };
const views = createReadCache<Answer>(onServer ? 0 : READ_TTL_MS);

/** Forget every cached view answer. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => views.clear();

const viewKey = (address: string, fn: string, args: Arg[]) => `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;

type ViewOptions = {
  /** drop the cached answer first, so this read is live */
  fresh?: boolean;
  /** read another register than the one in use (the /deploy page probes a pasted address) */
  register?: string;
};

/**
 * One view call through the cache, with the time its answer arrived. Throws RATE_LIMITED when
 * Studio is rate-limiting this browser, NO_REGISTER when no register is set, and the plain
 * network error when Studio never answered.
 */
async function viewAt(fn: string, args: Arg[] = [], opts: ViewOptions = {}): Promise<{ value: unknown; at: number }> {
  if (isMock) return { value: parseView(await mock.view(fn, args)), at: Date.now() };
  const address = opts.register || contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  const key = viewKey(address, fn, args);
  if (opts.fresh) views.forget(key);
  try {
    const answer = await views.get(key, async () => {
      const raw = await withRetry(
        () => reader().readContract({ address: address as Address, functionName: fn, args }),
        // A register with no such view is an answer, not flakiness: do not spend the bucket on it.
        { bucket: "gen", giveUp: isMissingMethodError },
      );
      return { raw, at: Date.now() };
    });
    return { value: parseView(answer.raw), at: answer.at };
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- row mappers (every missing field gets a default) ---------------------------

export function mapDeskRow(r: Row): DeskRow {
  return {
    id: str(r.desk ?? r.id),
    label: str(r.label),
    potAtto: atto(r.pot),
    members: num(r.members),
    openSpends: num(r.open_spends),
    openEnrolment: r.open_enrolment === undefined ? true : bool(r.open_enrolment),
    minNoticeMinutes: num(r.min_notice_minutes, LIMITS.noticeMinutes[0]),
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
  };
}

const stateOf = (v: unknown): SpendState => {
  const s = str(v, "open");
  return s === "paid" || s === "expired" ? s : "open";
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
    standsVerdict: verdictOf(r.stands_verdict),
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
  };
}

// ---- reads: one function per view ------------------------------------------------

/** desks(): the most recently opened desks. `register` reads another register (the /deploy probe). */
export async function readDesks(register?: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<DeskList>> {
  const { value } = await viewAt("desks", [], { register, fresh: opts.fresh });
  const o = asRow(value);
  // An address that is not a Recused register answers something else entirely.
  if (!("rows" in o) && !("count" in o)) throw new Error(NETWORK_ERROR);
  const rows = rowsOf(o.rows).map(mapDeskRow).filter((d) => d.id);
  return result({ count: num(o.count, rows.length), first: num(o.first, 1), rows });
}

/** desks_from(start): one page of desks from a given number onwards, so every desk can be listed. */
export async function readDesksFrom(start: number): Promise<ReadResult<DeskList>> {
  const { value } = await viewAt("desks_from", [String(Math.max(1, Math.trunc(start)))]);
  const o = asRow(value);
  const rows = rowsOf(o.rows).map(mapDeskRow).filter((d) => d.id);
  return result({ count: num(o.count, rows.length), first: num(o.first, 1), rows });
}

/** desk(desk): null when the register holds no such desk. */
export async function readDesk(desk: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Desk | null>> {
  const { value, at } = await viewAt("desk", [desk], opts);
  return result(isEmptyRow(value) ? null : mapDesk(value as Row, desk, at));
}

/** members(desk): every member's number, address, sequence number and counts. */
export async function readMembers(desk: string): Promise<ReadResult<MemberRow[]>> {
  const { value } = await viewAt("members", [desk]);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapMemberRow));
}

/** member(desk, addr): the whole disclosure, or null when that address has none on the desk. */
export async function readMember(desk: string, address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Member | null>> {
  const { value } = await viewAt("member", [desk, address.toLowerCase()], opts);
  return result(isEmptyRow(value) ? null : mapMember(value as Row, desk));
}

/** spends(desk): the most recent spends of the desk, oldest of them first. */
export async function readSpends(desk: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<SpendList>> {
  const { value, at } = await viewAt("spends", [desk], opts);
  if (isEmptyRow(value)) return result({ desk, count: 0, first: 1, rows: [], chainNow: 0, readAtMs: at });
  const o = asRow(value);
  const rows = rowsOf(o.rows).map((r) => mapSpendRow(r, desk));
  return result({ desk, count: num(o.count, rows.length), first: num(o.first, 1), rows, chainNow: secs(o.now), readAtMs: at });
}

/** spend(desk, n): null when the desk holds no such spend. */
export async function readSpend(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Spend | null>> {
  const { value, at } = await viewAt("spend", [desk, String(n)], opts);
  return result(isEmptyRow(value) ? null : mapSpend(value as Row, desk, at));
}

/** readings(desk, n): every reading on the spend, in the order written. */
export async function readReadings(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Reading[]>> {
  const { value } = await viewAt("readings", [desk, String(n)], opts);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapReading));
}

/** run(desk, payee): the run of spends to one payee address, with its gate; null when the desk does not exist. */
export async function readRun(desk: string, payee: string): Promise<ReadResult<Run | null>> {
  const { value } = await viewAt("run", [desk, payee.toLowerCase()]);
  if (isEmptyRow(value)) return result(null);
  const r = value as Row;
  return result({
    desk: str(r.desk ?? desk),
    payee: addr(r.payee),
    run: num(r.run),
    live: bool(r.live),
    gateSeq: num(r.gate_seq),
    first: str(r.first),
    identifications: rowsOf(r.identifications).length,
  });
}

/** reading(desk, n, addr): one member's stored reading, or null when there is none. */
export async function readReading(desk: string, n: number, address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Reading | null>> {
  const { value } = await viewAt("reading", [desk, String(n), address.toLowerCase()], opts);
  return result(isEmptyRow(value) ? null : mapReading(value as Row));
}

/** document(desk, n): the spend document exactly as it is judged, with its sha256. */
export async function readDocument(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<SpendDocument | null>> {
  const { value, at } = await viewAt("document", [desk, String(n)], opts);
  return result(isEmptyRow(value) ? null : mapDocument(value as Row, at));
}

/** idents(desk, n): every identification of the payee, with its author. */
export async function readIdents(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Ident[]>> {
  const { value } = await viewAt("idents", [desk, String(n)], opts);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapIdent));
}

/** The ring that keeps the refusals of callers with no disclosure on the desk they named. */
export const OPEN_RING = "open";

/**
 * refusals(desk): the ring of procedural refusals, oldest first. A desk's own ring holds only
 * the refusals of its members; OPEN_RING is the ring of every other caller, whichever desk they named.
 */
export async function readRefusals(desk: string): Promise<ReadResult<Refusal[]>> {
  const { value } = await viewAt("refusals", [desk]);
  return result(rowsOf(value).map(mapRefusal));
}

/** credit(desk, addr): one funder's units and what reclaim would pay them now. */
export async function readCredit(desk: string, address: string): Promise<ReadResult<Credit | null>> {
  const { value } = await viewAt("credit", [desk, address.toLowerCase()]);
  return result(isEmptyRow(value) ? null : mapCredit(value as Row, desk, address));
}

/** rule(): the limits the deployed contract enforces. The built-in defaults stand in when it cannot be read. */
export async function readLimits(): Promise<ReadResult<Limits>> {
  const { value } = await viewAt("rule", []);
  return result(isEmptyRow(value) ? LIMITS : mapLimits(value as Row));
}

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
  | "reclaim";

/** One contract call, ready to sign: the method, its arguments in the contract's order, and the value sent. */
export type Call = { fn: WriteFn; args: Arg[]; value?: bigint };

export type EntryInput = { name: string; relation: string; detail: string };
const entriesJson = (entries: EntryInput[]) =>
  JSON.stringify(entries.map((e) => ({ name: e.name.trim(), relation: e.relation, detail: e.detail.trim() })));
const csv = (addresses: string[]) => addresses.map((a) => a.trim().toLowerCase()).filter(Boolean).join(",");

export const calls = {
  /**
   * open_desk(label, roster_csv, min_notice_minutes), payable: the value sent is the desk's first
   * funding, and the minimum notice is the least time any spend on the desk must give its members.
   */
  openDesk: (label: string, roster: string[], valueAtto: bigint, minNoticeMinutes: number = LIMITS.noticeMinutes[0]): Call => ({
    fn: "open_desk",
    args: [label.trim(), csv(roster), Math.trunc(minNoticeMinutes)],
    value: valueAtto,
  }),
  /** fund(desk), payable. */
  fund: (desk: string, valueAtto: bigint): Call => ({ fn: "fund", args: [desk], value: valueAtto }),
  /** enrol(desk, statement, entries_json, addresses_csv) */
  enrol: (desk: string, statement: string, entries: EntryInput[], addresses: string[]): Call => ({
    fn: "enrol",
    args: [desk, statement.trim(), entriesJson(entries), csv(addresses)],
  }),
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
};

/** True for the one call the validators judge: the rail then shows their votes. */
export const isJudged = (fn: WriteFn) => fn === "approve";

const WRONG_CHAIN = (chainId: number | null) =>
  `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call.fn, call.args, call.value ?? 0n);
  const address = contractAddress();
  if (!address)
    throw new Error(
      "This site is not pointed at a register yet. Deploy your own from the Deploy page; it takes one signature and this browser then reads it.",
    );
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- page-held keys: the practice desk's other members ---------------------------------
// The practice desk (/practice) plays the members a lone visitor would otherwise have to find.
// Their keys are made in the browser, kept in its storage, and sign here with the SDK's own
// local-account path: the same writeContract as the wallet's, with no provider in between.
// They are throwaway keys that only ever hold test GEN.

/** A new private key, made in this browser. */
export const newKey = (): string => generatePrivateKey();

/** The lowercase address of a page-held key. */
export const keyAddress = (key: string): string => createAccount(key as `0x${string}`).address.toLowerCase();

/** Sends a call signed by a page-held key. Resolves to the transaction hash. */
export async function writeAs(key: string, call: Call): Promise<string> {
  if (isMock) return mock.write(call.fn, call.args, call.value ?? 0n, keyAddress(key));
  const address = contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  const client = createClient({ chain: studio, account: createAccount(key as `0x${string}`) });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The network returned no transaction hash.");
  return hash;
}

/** Demo mode only: moves the in-memory contract's clock forward. Does nothing on the chain. */
export function skipMockClock(seconds: number): void {
  if (isMock) mock.skipClock(seconds);
}

// ---- outcomes: what a finished call's JSON return means ----------------------------

const stripTag = (m: string) => m.replace(/^\s*\[(EXPECTED|TRANSIENT)\]\s*/i, "").trim();

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
  /** the second clear reading: the spend was paid in this transaction */
  | { kind: "paid"; reading: Reading; paidAtto: string; to: string; potAtto: string }
  /** the first clear reading: counted, one more needed */
  | { kind: "counted"; reading: Reading }
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
    if (str(r.state) === "paid" || str(r.counted).startsWith("2") || num(r.approvals) >= 2)
      return { kind: "paid", reading, paidAtto: atto(r.paid), to: addr(r.to), potAtto: atto(r.pot) };
    return { kind: "counted", reading };
  }
  if (r.ok === false) {
    if (verdictOf(r.verdict) && r.attempt_spent !== false) return { kind: "recused", reading: mapReading(r) };
    return { kind: "procedural", reason: stripTag(str(r.reason)) };
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
export function openedDesk(s: TxStatus | null): { desk: string; label: string } | null {
  const r = s?.result;
  if (!r || r.ok !== true || !r.desk) return null;
  return { desk: str(r.desk), label: str(r.label) };
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

/** enrol's and amend's return: the member number, the sequence number and the version. */
export function filedDisclosure(s: TxStatus | null): { member: string; filedSeq: number; version: number } | null {
  const r = s?.result;
  if (!r || r.ok !== true || !r.member) return null;
  return { member: str(r.member), filedSeq: num(r.filed_seq), version: num(r.version, 1) };
}

/** reclaim's return: what was paid back, in atto. */
export function reclaimed(s: TxStatus | null): string {
  const r = s?.result;
  return r && r.ok === true ? atto(r.reclaimed) : "0";
}

/** True when GEN moves to or from somebody because of this call, so balances are watched afterwards. */
export function movesMoney(s: TxStatus): boolean {
  const r = s.result;
  if (!r) return false;
  if ("returned" in r || "reclaimed" in r || "sent" in r) return true;
  if ("paid" in r && atto(r.paid) !== "0") return true;
  return r.ok === true && "pot" in r && "opener" in r;
}

// ---- deploy, transactions, balances -------------------------------------------------

/** Deploys the contract source from the connected wallet (the /deploy page). Resolves to the deploy tx hash. */
export async function deploy(code: string): Promise<string> {
  if (isMock) return mock.deploy();
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  // The contract's constructor takes no arguments.
  const hash = await client.deployContract({ code, args: [], leaderOnly: false });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

/** The address a deploy transaction created; "" until the network has accepted it. */
export async function deployedAddress(hash: string): Promise<string> {
  if (isMock) return mock.MOCK_REGISTER;
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  const data = tx?.data as { contract_address?: string } | undefined;
  return typeof data?.contract_address === "string" ? data.contract_address : "";
}

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway, so a dropped request is just a later poll.
  // eth_* has its own bucket, so a gen_call cooldown never stalls the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth" });
  return BigInt(hex || "0x0");
}

/** Pause between faucet tries: sim_fundAccount shares the 30 a minute bucket with the reads. */
const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
/** How long the faucet waits for the credit to show in the balance. */
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN (amount in wei as a JS number), up to three tries ten
 * seconds apart, each one after the gen_call cooldown. Resolves when the balance moved; a
 * refusal on every try is FAUCET_REFUSED. `stillWanted` is asked between balance polls: once
 * it says no (the wallet switched accounts), the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: sim_fundAccount with the lowercase spelling
  // the site keeps is accepted, finalizes with value 10 GEN, and never reaches the balance.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      // A refusal is a refusal whatever the shape: 429 behind CORS, -32029, or a dropped
      // request. A rate-limited one also starts the gen_call cooldown, so the reads back off too.
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
