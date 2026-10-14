// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/recused.py (version 2) rule for rule on everything deterministic: the door
// checks, the sequence counter, the windows, the model-free refusals, the stakes, the hold, the
// challenge rules checked before any page is fetched, the money path of every settlement, and the
// refusal ring. It answers every view in the contract's own JSON shape, so the mappers in
// lib/contract.ts run on the same rows in both modes. Two things it cannot do: ask a model, and
// fetch a page. A reading here is SCRIPTED (scriptedValue), a register page is served from the
// copy of registry/ in lib/registry.ts and judged by a SCRIPTED rule (scriptedFinding), and the
// demo banner says so on every page.
//
// The demo content is a tenants' association fund: one desk, five members, five spends that between
// them show a paid spend (released after its hold), a recusal by declared address, a recusal by
// reading, a late disclosure, an expiry, a spend still in its notice window, and a spend in its hold
// whose countersigner sits on the board of the payee and never said so. State lives for as long as
// the tab does; a reload starts it again.

import type { TxStatus, WriteFn } from "./contract";
import { notify } from "./browser-store";
import { REGISTER_TEXT, everydayRegistry, isDemoRegistry, registryPrefixAt } from "./registry";

const GEN = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";
export const MOCK_REGISTER = "0x00000000000000000000000000000000000d3a10";

// In a browser every answer takes a moment, as Studio's do; node (the unit tests) runs at once.
const delay = (ms: number) => (typeof window === "undefined" ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms)));
// The demo clock can be moved forward (the practice desk's "skip the wait"), never back.
let clockSkew = 0;
const clockNow = () => Math.floor(Date.now() / 1000) + clockSkew;
/** Moves the demo clock forward by so many seconds. */
export function skipClock(seconds: number): void {
  clockSkew += Math.max(0, Math.trunc(seconds));
  notify();
}
/** The demo clock in seconds (tests and the practice desk's skip). */
export const mockNow = (): number => clockNow();

// ---- who the visitor is acting as ---------------------------------------------

export type Persona = { address: string; name: string; note: string };

const PRINTER = "0x51d0a7e4c2b98f3361ad04c7e85b12f09d3c6a41";
const BIKE_CHAIR = "0x7be2c94f0a6d318e55c7f120b9a84d63e07f1c25";
const TEACHER = "0x2f8a61d3b7c05e94a1f6d82c304b7e59c6a0d8f3";
const NURSE = "0xc4096be17a52d38f0e6b91a47d25c803f1e7a69b";
const TRANSLATOR = "0x93e5f07a2d1c48b6e30f5a79c81d24b6f0a35e7c";
const VISITOR = "0x0d17b3a9e86f42c50b9e31d7f4a82c6950e1b3d8";

const PRINT_SHOP_TILL = "0x6a3f91c2e5d7048b1f6c2a93e0d584b7c19f2e60";
const BIKE_GROUP_ACCOUNT = "0xe81c5d20f79a346b8c0e17f5a2d96b304c7e85a1";
const LOCKSMITH = "0x3b70e4a6c1d9258f7e03b6a14c8d5f92e60a7b19";
const HALL = "0x58c2f6019ad3e74b0c85f1d36a297e40b3c8d6f2";
const GULL = "0xa47c02e9d5b8f136e70c4b29d8a15f63c2e09b74";

/** The accounts a visitor can act as in mock mode. The first is a newcomer with no disclosure. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "A new neighbour", note: "starts with no disclosure" },
  { address: PRINTER, name: "The print shop co-owner", note: "member M1, Mara Quist" },
  { address: BIKE_CHAIR, name: "The bike group chair", note: "member M2, Tomas Brandt" },
  { address: TEACHER, name: "The teacher", note: "member M3, Elin Varga" },
  { address: NURSE, name: "The night nurse", note: "member M4, Ines Corrie" },
  { address: TRANSLATOR, name: "The translator", note: "member M5, enrolled late" },
];

let persona = VISITOR;
/** The address the mock treats as the connected wallet. */
export const mockAddress = (): string => persona;
export function setMockPersona(address: string): void {
  if (PERSONAS.some((p) => p.address === address)) persona = address;
  notify();
}

// ---- balances --------------------------------------------------------------------

const balances = new Map<string, bigint>([
  [PRINTER, 14n * GEN],
  [BIKE_CHAIR, 9n * GEN],
  [TEACHER, 11n * GEN],
  [NURSE, 16n * GEN],
  [TRANSLATOR, 10n * GEN],
  [VISITOR, 0n],
]);
const balance = (a: string) => balances.get(a.toLowerCase()) ?? 0n;
const credit = (a: string, v: bigint) => {
  balances.set(a.toLowerCase(), balance(a) + v);
  notify();
};
/** The balance as a decimal string: a stable snapshot for useSyncExternalStore. */
export const mockBalanceText = (address: string): string => balance(address).toString();

// ---- the contract's constants ------------------------------------------------------

const RELATION_PHRASE: Record<string, string> = {
  owns: "the member owns it",
  part_owns: "the member owns part of it",
  officer_of: "the member is an officer or a director of it",
  employed_by: "the member is employed by it",
  member_of: "the member belongs to it",
  family: "the member is related by family to it, or to whoever runs it",
  supplies: "the member supplies it with goods or services",
  buys_from: "the member buys goods or services from it",
  landlord_of: "the member is its landlord",
  tenant_of: "the member rents from it",
  lends_to: "the member has lent money to it",
  owes_to: "the member owes money to it",
  volunteers_for: "the member does unpaid work for it",
  competes_with: "the member competes with it",
  other: "the member has some other relation to it, in their own words below",
};
const RELATIONS = Object.keys(RELATION_PHRASE);
const STOP_WORDS = ["the", "a", "an", "my", "our", "of", "and"];
const PLACEHOLDER_WORDS = [
  "various", "several", "misc", "miscellaneous", "etc", "things", "stuff", "something", "anything", "everything",
  "whatever", "unspecified", "other", "others", "many", "some", "none", "nothing", "nil", "na", "business",
  "businesses", "interests", "activities", "assorted", "sundry", "general",
];
const BRANCH_PHRASE: Record<string, string> = {
  G: "something the member filed is better off",
  L: "something the member filed is worse off",
  U: "nothing the member filed is moved",
  "?": "the reading could not say whether anything the member filed is moved",
  "/": "the two presentation orders gave different directions",
  x: "the answer could not be read",
  "-": "no model was asked",
};
const VERDICT_SENTENCE: Record<string, string> = {
  clear: "Nothing this member filed is moved either way, so the countersignature is counted.",
  interested: "Something this member filed is moved, so the countersignature is refused and recorded.",
  unclear: "The reading did not settle on nothing being moved, so the countersignature is refused and recorded.",
  declared:
    "The payee of this spend is this member's own address or one of the addresses the member declared as their own, so the countersignature is refused with no model asked at all.",
  late: "This member's disclosure was filed after a spend to this payee address was first posted and not since paid, so it is never read against this spend and the countersignature is refused with no model asked at all.",
  standing:
    "This member was already read on an earlier spend to this same payee address, no spend to that address has been paid since, and that reading was not clear or was struck by a register page, so it stands and the countersignature is refused with no model asked at all.",
};

const L = {
  MIN_STATEMENT: 24, MAX_STATEMENT: 600, MIN_ENTRIES: 1, MAX_ENTRIES: 6, MIN_ENTRY_NAME: 3, MAX_ENTRY_NAME: 80,
  MAX_ENTRY_DETAIL: 160, MIN_OTHER_DETAIL: 12, MAX_DECLARED: 6, MIN_DESCRIPTION: 16, MAX_DESCRIPTION: 400,
  MIN_IDENT: 8, MAX_IDENT: 200, MAX_IDENTS: 4, MIN_LABEL: 4, MAX_LABEL: 60, MAX_ROSTER: 20, MAX_MEMBERS: 20,
  MIN_MEMBERS_TO_POST: 3, MAX_OPEN_SPENDS: 8, MAX_OPEN_PER_POSTER: 2, MIN_NOTICE_MINUTES: 5, MAX_NOTICE_MINUTES: 1440, MIN_LIVE_MINUTES: 10,
  MAX_WINDOW_MINUTES: 20160, REFUSALS_KEPT: 12, MAX_LIST_PARTS: 48, MAX_LIST_CHARS: 48 * 44,
  MIN_HOLD_MINUTES: 5, MAX_HOLD_MINUTES: 10080, MAX_REGISTRIES: 3, MAX_REGISTRY: 120, MAX_REGISTRIES_JSON: 420,
  MAX_URL: 200, MIN_PUBLIC_NAME: 3, MAX_PUBLIC_NAME: 60, MAX_PAGE_TEXT: 8000, MAX_RAW_PAGE: 32000, FP_CHARS: 16,
  PAGE: 20,
};
const MIN_STAKE = GEN / 10n;
const MAX_STAKE = 100n * GEN;
const CHALLENGE_BOND = GEN / 20n;
const COUNT_CEILING = 1_000_000_000;

/** A raised refusal: nothing changes and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};
/**
 * A register round no validator would agree with: the page could not be fetched or answered an
 * error status. Nothing is stored and no bond is taken; the transaction ends with no majority.
 */
class Unsettled extends Error {}
const problemOf = (e: unknown): string => (e instanceof Refused ? e.message.replace("[EXPECTED] ", "") : String(e));

// ---- helpers the contract has under the same names -----------------------------------

const norm = (text: unknown) => String(text).toLowerCase().split(/\s+/).filter(Boolean).join(" ");

async function sha256(text: string): Promise<string> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // No WebCrypto on this origin: a stable stand-in, good enough to tell two texts apart.
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(16).padStart(8, "0").repeat(8);
  }
}
const digestOf = (text: unknown) => sha256(norm(text));

const isAddress = (text: string) => /^0x[0-9a-f]{40}$/.test(text) && text !== ZERO;
const whole = (raw: unknown): bigint => {
  const s = String(raw).trim();
  return s && s.length <= 40 && /^\d+$/.test(s) ? BigInt(s) : -1n;
};

function textProblem(text: string, least: number, most: number, what: string): string {
  if (text.length < least || text.length > most) return `${what} is ${least} to ${most} characters`;
  for (const ch of text) {
    if (ch === "<" || ch === ">") return `${what} may not contain < or >; write the comparison in words`;
    if (ch === '"')
      return `${what} may not contain a double quote, because the fund prints your words inside double quotes; use an apostrophe`;
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return `${what} is printable ASCII on one line`;
  }
  return "";
}

function nameProblem(name: string): string {
  const problem = textProblem(name, L.MIN_PUBLIC_NAME, L.MAX_PUBLIC_NAME, "the public name");
  if (problem) return problem;
  if (!/[A-Za-z]/.test(name)) return "the public name is the name a public register would list you under, so it holds letters";
  return "";
}

/** _url_problem, word for word. */
function urlProblem(url: string, most: number, what: string): string {
  if (url.length > most) return `${what} is at most ${most} characters`;
  if (!url.startsWith("https://")) return `${what} starts with https://`;
  const rest = url.slice("https://".length);
  const bare = rest.replace(/[-._~/]/g, "");
  if (!/^[\x00-\x7f]*$/.test(rest) || !(bare === "" || /^[A-Za-z0-9]+$/.test(bare)))
    return `${what} uses only letters, digits and - . _ ~ / after https://`;
  const slash = rest.indexOf("/");
  const host = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? "" : rest.slice(slash + 1);
  if (slash < 0 || !host.includes(".") || host !== host.toLowerCase() || host.startsWith(".") || host.endsWith("."))
    return `${what} names a lowercase host such as registry.example, then a path`;
  if (rest.includes("//") || ("/" + path + "/").includes("/./") || ("/" + path + "/").includes("/../"))
    return `${what} has no empty, "." or ".." segment`;
  return "";
}

/** A number with a fraction or an exponent outside a string: the contract's JSON reader refuses it. */
const FLOAT_IN_JSON = /(^|[[,:\s])-?\d+(\.\d+|[eE][+-]?\d+)/;

/** _registries_problem, word for word: why not, and the prefixes as they will be stored. */
function registriesProblem(raw: unknown): [string, string[]] {
  const text = String(raw).trim();
  if (text.length > L.MAX_REGISTRIES_JSON) return [`the registers are at most ${L.MAX_REGISTRIES_JSON} characters of JSON`, []];
  let items: unknown;
  try {
    if (FLOAT_IN_JSON.test(text)) throw new Error("float");
    items = JSON.parse(text);
  } catch {
    return [
      `the registers are a JSON list of 1 to ${L.MAX_REGISTRIES} https address prefixes, like ["https://registry.example/companies/"], with no number in it`,
      [],
    ];
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > L.MAX_REGISTRIES)
    return [`the registers are a list of 1 to ${L.MAX_REGISTRIES} address prefixes`, []];
  const out: string[] = [];
  for (const item of items.slice(0, L.MAX_REGISTRIES)) {
    if (typeof item !== "string") return ["every register is an address prefix written as a string", []];
    const prefix = item.trim();
    const problem = urlProblem(prefix, L.MAX_REGISTRY, "a register prefix");
    if (problem) return [problem, []];
    if (!prefix.endsWith("/")) return ["a register prefix ends with /, so it names a whole directory of pages", []];
    if (out.includes(prefix)) return ["the registers name the same prefix twice", []];
    out.push(prefix);
  }
  return ["", out];
}

const under = (url: string, prefixes: string[]) => prefixes.slice(0, L.MAX_REGISTRIES).some((p) => url.startsWith(p) && url.length > p.length);

function isPlaceholder(name: string): boolean {
  const words = name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[.,;:!?'"()[\]]+|[.,;:!?'"()[\]]+$/g, ""))
    .filter((w) => w && !STOP_WORDS.includes(w));
  return words.length === 0 || words.every((w) => PLACEHOLDER_WORDS.includes(w));
}

type Entry = { name: string; relation: string; detail: string };

function parseEntries(raw: unknown): Entry[] {
  let items: unknown;
  try {
    if (FLOAT_IN_JSON.test(String(raw))) throw new Error("float");
    items = JSON.parse(String(raw));
  } catch {
    return fail(
      'the entries are a JSON list of objects, each with a name, a relation and a detail, like [{"name": "Pelican Press", "relation": "part_owns", "detail": "a print shop"}]',
    );
  }
  if (!Array.isArray(items)) return fail("the entries are a JSON list of objects");
  if (items.length < L.MIN_ENTRIES || items.length > L.MAX_ENTRIES)
    return fail(
      `file ${L.MIN_ENTRIES} to ${L.MAX_ENTRIES} entries; a member who names nothing at all hands a reading nothing to check and may not countersign`,
    );
  return items.map((item, k) => {
    const where = "entry " + (k + 1);
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail(where + " is an object with a name, a relation and a detail");
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const relation = String(o.relation ?? "").trim().toLowerCase();
    const detail = String(o.detail ?? "").trim();
    let problem = textProblem(name, L.MIN_ENTRY_NAME, L.MAX_ENTRY_NAME, "the name of " + where);
    if (problem) return fail(problem);
    if (!(relation in RELATION_PHRASE)) return fail(`the relation of ${where} is exactly one of: ${RELATIONS.join(", ")}`);
    if (detail) {
      problem = textProblem(detail, 1, L.MAX_ENTRY_DETAIL, "the detail of " + where);
      if (problem) return fail(problem);
    }
    if (relation === "other" && detail.length < L.MIN_OTHER_DETAIL)
      return fail(`${where} has the relation "other", so its detail says what the relation is, in at least ${L.MIN_OTHER_DETAIL} characters`);
    if (isPlaceholder(name))
      return fail(
        `the name of ${where} is made only of words from a fixed list this contract holds (${PLACEHOLDER_WORDS.slice(0, 8).join(", ")} and others, with ${STOP_WORDS.join(", ")} dropped first). That is a word list and not a judgement of what you wrote: name the counterparty or the activity, however ordinary it is`,
      );
    return { name, relation, detail };
  });
}

function parseAddresses(raw: unknown, most: number, what: string): string[] {
  const out: string[] = [];
  const text = String(raw).trim();
  if (!text) return out;
  const parts = text.length <= L.MAX_LIST_CHARS ? text.split(",") : [];
  if (!parts.length || parts.length > L.MAX_LIST_PARTS)
    return fail(`a list of ${what}es is at most ${L.MAX_LIST_PARTS} comma separated parts and ${L.MAX_LIST_CHARS} characters`);
  let place = 0;
  for (const part of parts) {
    const s = part.trim().toLowerCase();
    if (!s) continue;
    place += 1;
    if (!isAddress(s)) return fail(`each ${what} is a 0x address of 40 hexadecimal digits and not the zero address; number ${place} in this list is not one`);
    if (!out.includes(s)) out.push(s);
  }
  if (out.length > most) return fail(`at most ${most} of them: this list holds ${out.length} ${what}es`);
  return out;
}

/** The second presentation order of n things, in which none of them keeps its position. */
function secondOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => n - i);
  if (n % 2 === 1 && n > 1) {
    order.push(order.shift()!);
    [order[n - 2], order[n - 1]] = [order[n - 1], order[n - 2]];
  }
  return order;
}

const fence = (raw: unknown) => String(raw).replace(/</g, "(").replace(/>/g, ")");
const quoted = (raw: unknown) => '"' + fence(raw).replace(/"/g, "'") + '"';

function why(value: string, verdict: string): string {
  const one = BRANCH_PHRASE[value[0]] ?? BRANCH_PHRASE["-"];
  const two = BRANCH_PHRASE[value[1]] ?? BRANCH_PHRASE["-"];
  return `If the spend is carried out, ${one}; if it is not carried out, ${two}. ${VERDICT_SENTENCE[verdict]}`;
}

const verdictFor = (value: string) => (value === "UU" ? "clear" : /[GL]/.test(value) ? "interested" : "unclear");

// ---- state -----------------------------------------------------------------------

type Desk = {
  id: string; opener: string; label: string; roster: string[]; pot: bigint; committed: bigint; drawn: bigint;
  fundedTotal: bigint; claimsOpen: bigint; claimsDue: bigint; open: number[]; nMembers: number; nSpends: number;
  nOpen: number; nPaid: number; nExpired: number; nReadings: number; nRefusals: number; openedAt: number;
  openedSeq: number; fundRound: number; minNotice: number;
  registries: string[]; memberStake: bigint; holdMinutes: number; staked: bigint; slashedIn: bigint; nHolding: number;
  nChallenges: number; nHidden: number; nCleared: number; nUnclear: number;
};
type Member = {
  who: string; desk: string; number: number; statement: string; entries: Entry[]; declared: string[];
  filedSeq: number; filedAt: number; version: number; digest: string; openPosted: number;
  publicName: string; stake: bigint; holdsOpen: number; signedOpen: number; hidden: number; cleared: number; retired: boolean;
};
type Spend = {
  desk: string; number: number; poster: string; payee: string; amount: bigint; description: string; digest: string;
  docDigest: string; postedSeq: number; gateSeq: number; run: number; postedAt: number; noticeUntil: number;
  windowUntil: number; state: string; approvals: number; approver1: string; approver2: string; nIdents: number;
  shutOut: number; nAttempts: number; posterTried: number; claimed: bigint; paidAt: number; expiredAt: number;
  posterDeclared: boolean; heldAt: number; holdUntil: number; nHolds: number; nStruck: number; nChallenges: number;
};
type Ident = { n: number; by: string; member: number; text: string; at: number; seq: number; digest: string; from: string };
/** The spends posted to one payee address since the last one that was paid. */
type Run = { run: number; live: boolean; gate: number; first: number; idents: (Omit<Ident, "n" | "from"> & { on: number })[] };
type Row = Record<string, unknown>;
type Version = { statement: string; entries: Entry[]; declared: string[]; filedSeq: number };

const LIVE = ["open", "holding"];

const desks = new Map<string, Desk>();
let deskCount = 0;
const members = new Map<string, Member>(); // "D1:<address>"
const memberAt = new Map<string, string>(); // "D1:M3" -> "D1:<address>"
const history = new Map<string, Version>(); // "D1:<address>:2": a superseded version
const spends = new Map<string, Spend>(); // "D1:S4"
const spendDigests = new Map<string, string>(); // "D1:<digest>" -> "S4"
const runs = new Map<string, Run>(); // "D1:<payee>"
const standing = new Map<string, Row>(); // "D1:<payee>:<run>:<address>": the reading that stands in that run
const idents = new Map<string, Ident[]>(); // "D1:S4"
const identBy = new Set<string>(); // "D1:S4:<address>": said, or tried to say, who the payee is
const readings = new Map<string, Row[]>(); // "D1:S4", in the order written
const funded = new Map<string, bigint>(); // "D1:1:<address>"
const claims = new Map<string, bigint>(); // "D1:S4:<address>": atto that funder left committed to S4
const claimLists = new Map<string, number[]>(); // "D1:<address>": the spends that funder has a claim on
const refusals = new Map<string, Row[]>(); // ring per desk, and "open"
const challengeRows = new Map<string, Row[]>(); // "D1:S4", in the order read
const challengeSeen = new Map<string, string>(); // "D1:S4:<addr>:<url hash>" and "D1:S4:<addr>:fp:<fp>" -> the challenge
const bondCredit = new Map<string, bigint>(); // "<address>"
let openRefusals = 0;
let seqCount = 0;
const totals = { bond: 0n, bounties: 0n, bondsToMembers: 0n, challenges: 0, hidden: 0, cleared: 0, unclear: 0, released: 0 };

const nextSeq = () => ++seqCount;
// What the contract prints in place of an id or a number that does not have the shape it gives one.
const deskWord = (raw: unknown) => (/^D[1-9]\d{0,9}$/.test(String(raw).trim()) ? String(raw).trim() : "(not a desk id)");
const addressWord = (raw: unknown) => (/^0x[0-9a-f]{40}$/.test(String(raw).trim().toLowerCase()) ? String(raw).trim().toLowerCase() : "(not an address)");
const spendWord = (raw: unknown) => (whole(raw) >= 0n ? "S" + whole(raw) : "(not a number)");

const deskOf = (id: string): Desk => desks.get(id) ?? fail("no desk " + deskWord(id));
function spendOf(deskId: string, spend: unknown): Spend {
  const n = whole(spend);
  return (n >= 1n ? spends.get(`${deskId}:S${n}`) : undefined) ?? fail(`no spend ${spendWord(spend)} on ${deskId}`);
}
const creditKey = (d: Desk, who: string) => `${d.id}:${d.fundRound}:${who}`;
const runOf = (key: string): Run => runs.get(key) ?? { run: 0, live: false, gate: 0, first: 0, idents: [] };
const standingKey = (s: Spend, who: string) => `${s.desk}:${s.payee}:${s.run}:${who}`;
const bondOf = (who: string) => bondCredit.get(who) ?? 0n;
const readingOf = (s: Spend, who: string): Row | undefined => (readings.get(`${s.desk}:S${s.number}`) ?? []).find((r) => r.member === who);

/** What ends with a spend, paid or expired: its place among the open ones, and its poster's count. */
function leaveOpen(d: Desk, s: Spend): void {
  d.open = d.open.filter((n) => n !== s.number);
  d.nOpen -= 1;
  const poster = members.get(`${d.id}:${s.poster}`);
  if (poster && poster.openPosted > 0) poster.openPosted -= 1;
}

/** Move one counted signer's two counts of open signatures. An empty slot is skipped; never below zero. */
function signer(deskId: string, who: string, holds: number, signed: number): void {
  if (!who || who === ZERO) return;
  const m = members.get(`${deskId}:${who}`);
  if (!m) return;
  m.holdsOpen = Math.max(0, m.holdsOpen + holds);
  m.signedOpen = Math.max(0, m.signedOpen + signed);
}

/** Every claim one funder still holds, with the state of the spend it is on. A claim on a paid spend is void. */
function claimsOf(deskId: string, who: string): { n: number; amount: bigint; state: string }[] {
  const out: { n: number; amount: bigint; state: string }[] = [];
  for (const n of claimLists.get(`${deskId}:${who}`) ?? []) {
    const s = spends.get(`${deskId}:S${n}`);
    const amount = claims.get(`${deskId}:S${n}:${who}`) ?? 0n;
    if (!s || s.state === "paid" || amount < 1n) continue;
    out.push({ n, amount, state: s.state });
  }
  return out;
}

/**
 * A procedural refusal, kept in a ring. A desk's own ring is written only by an address that
 * holds a disclosure on that desk; every other refusal goes to the "open" ring.
 */
function refuse(deskId: string, who: string, reason: string, extra: Row, now: number): Row {
  const d = desks.get(deskId);
  const known = d ? deskId : "";
  const inside = !!d && members.has(`${deskId}:${who}`);
  const where = inside ? deskId : "open";
  const seq = inside ? ++d!.nRefusals : ++openRefusals;
  const ring = refusals.get(where) ?? [];
  ring[(seq - 1) % L.REFUSALS_KEPT] = { desk: known, ring: where, by: who, reason, seq, at: now, kind: "procedural", ...extra };
  refusals.set(where, ring);
  return { ok: false, desk: known, ring: where, by: who, reason, recorded: true, kind: "procedural", attempt_spent: false, ...extra };
}

/** Return what was sent, remember the refusal, answer ok: false. Never raises. */
function refusePayable(sender: string, value: bigint, deskId: string, reason: string, now: number): Row {
  const out = refuse(deskId, sender, reason, {}, now);
  if (value > 0n) credit(sender, value);
  return { ...out, returned: value.toString() };
}

function spendDocument(s: Spend, second = false): string {
  const poster = members.get(`${s.desk}:${s.poster}`);
  const lines = [
    `SPEND NUMBER: S${s.number} of desk ${s.desk}`,
    `SEQUENCE NUMBER: ${s.postedSeq} (the fund's own counter; every disclosure read against this spend was filed at a lower number)`,
    `PAYEE ADDRESS: ${s.payee}`,
    `AMOUNT: ${s.amount} atto, which is ${s.amount / GEN} whole GEN and ${s.amount % GEN} atto over`,
    `POSTED BY: member M${poster ? poster.number : 0} of this desk, address ${s.poster}`,
    `DESCRIPTION WRITTEN BY THE POSTER: ${quoted(s.description)}`,
  ];
  if (s.posterDeclared) lines.push("THE POSTER DECLARED THIS PAYEE ADDRESS AS ONE OF THEIR OWN INTERESTS.");
  const list = idents.get(`${s.desk}:S${s.number}`) ?? [];
  if (!list.length) lines.push("NO MEMBER OF THE FUND HAS SAID WHO THE PAYEE IS.");
  const order = second ? secondOrder(list.length) : list.map((_, i) => i + 1);
  for (const k of order) {
    const it = list[k - 1];
    lines.push(`PAYEE IDENTIFIED BY MEMBER M${it.member}, ADDRESS ${it.by}: ${quoted(it.text)}`);
  }
  if (s.shutOut > 0)
    lines.push(`MEMBERS WHO TRIED TO SAY WHO THE PAYEE IS AFTER THE PLACES FOR THAT WERE TAKEN, AND WHOSE WORDS ARE NOT PRINTED: ${s.shutOut}`);
  return lines.join("\n");
}

/** The member's disclosure as it stood when the reading was made: the version the reading names. */
function disclosureAtSigning(m: Member, reading: Row): Version {
  const version = Number(reading.version ?? 0);
  if (version === m.version) return { statement: m.statement, entries: m.entries, declared: m.declared, filedSeq: m.filedSeq };
  return history.get(`${m.desk}:${m.who}:${version}`) ?? { statement: m.statement, entries: m.entries, declared: m.declared, filedSeq: m.filedSeq };
}

/**
 * The scripted stand-in for the consensus round. A real reading asks a model both branches in
 * both presentation orders; this one only looks for the name of something the member filed
 * inside the spend document. A competitor that is named reads as worse off if the spend is
 * carried out and better off if it is not; anything else that is named reads as better off if
 * it is carried out; nothing named reads as clear.
 */
function scriptedValue(doc: string, member: Member): string {
  const text = norm(doc);
  for (const e of member.entries) {
    const name = norm(e.name);
    if (name.length >= 4 && text.includes(name)) return e.relation === "competes_with" ? "LG" : "GU";
  }
  return "UU";
}

/** The page a register serves, as text with its spacing collapsed; null when it cannot be read (a 404). */
function fetchPage(url: string): string | null {
  const prefix = url.slice(0, url.lastIndexOf("/") + 1);
  const file = url.slice(url.lastIndexOf("/") + 1);
  if (!isDemoRegistry(prefix) || !(file in REGISTER_TEXT)) return null;
  const text = REGISTER_TEXT[file].slice(0, L.MAX_RAW_PAGE).split(/\s+/).filter(Boolean).join(" ");
  return text ? text.slice(0, L.MAX_PAGE_TEXT) : null;
}

const coreName = (company: string) => norm(company).replace(/\b(ltd|limited|plc|llc|inc)\.?$/, "").trim();

/**
 * The scripted stand-in for the register round, which on the chain asks SHOWS and SILENT, each in
 * two presentation orders, of every validator's own copy of the page. Here: a page that does not
 * give the member's public name is unclear; a page about a company the spend does not pay names the
 * member and shows nothing about the payee, so clean; a page about the payee shows a present
 * relation the disclosure leaves out (hidden), one it mentions (clean), or only a former one
 * (unclear).
 */
function scriptedFinding(page: string, spendDoc: string, disclosure: Version, publicName: string): "hidden" | "clean" | "unclear" {
  const text = norm(page);
  const name = norm(publicName);
  if (!name || !text.includes(name)) return "unclear";
  const company = /company name: (.+?) company number/.exec(text)?.[1] ?? "";
  const core = coreName(company);
  if (!core || !norm(spendDoc).includes(core)) return "clean";
  const formerAt = text.indexOf("former officers:");
  const controlAt = text.indexOf("persons with significant control:");
  const former = formerAt < 0 ? "" : text.slice(formerAt, controlAt > formerAt ? controlAt : text.length);
  const present = former ? text.replace(former, " ") : text;
  if (!present.includes(name)) return "unclear";
  const filed = norm([disclosure.statement, ...disclosure.entries.map((e) => `${e.name} ${e.detail}`)].join(" "));
  return filed.includes(core) ? "clean" : "hidden";
}

// ---- the methods that write ----------------------------------------------------------

type Ctx = { sender: string; value: bigint; now: number };

async function openDesk(
  c: Ctx, label: string, rosterCsv: string, minNoticeMinutes: unknown, registriesJson: unknown, memberStake: unknown, holdMinutes: unknown,
): Promise<Row> {
  label = String(label).trim();
  const floor = Number(whole(minNoticeMinutes));
  let problem = "";
  let roster: string[] = [];
  try {
    roster = parseAddresses(rosterCsv, L.MAX_ROSTER, "roster address");
  } catch (e) {
    problem = "the roster: " + problemOf(e);
  }
  if (!problem && roster.length && roster.length < L.MIN_MEMBERS_TO_POST)
    problem = `a roster names at least ${L.MIN_MEMBERS_TO_POST} addresses, because a spend needs its poster and two other members; leave the roster empty for open enrolment`;
  if (!problem) problem = textProblem(label, L.MIN_LABEL, L.MAX_LABEL, "the desk's name");
  if (!problem && !(floor >= L.MIN_NOTICE_MINUTES && floor <= L.MAX_NOTICE_MINUTES))
    problem = `the desk's minimum notice is ${L.MIN_NOTICE_MINUTES} to ${L.MAX_NOTICE_MINUTES} minutes; it is fixed here and no spend on this desk may give its members less time to say who a payee is`;
  let registries: string[] = [];
  if (!problem) [problem, registries] = registriesProblem(registriesJson);
  const stake = whole(memberStake);
  if (!problem && !(stake >= MIN_STAKE && stake <= MAX_STAKE))
    problem = `the member stake is a whole number of atto from ${MIN_STAKE} (0.1 GEN) to ${MAX_STAKE} (100 GEN); every member puts it up to countersign, and it is fixed here`;
  const hold = Number(whole(holdMinutes));
  if (!problem && !(hold >= L.MIN_HOLD_MINUTES && hold <= L.MAX_HOLD_MINUTES))
    problem = `the hold is ${L.MIN_HOLD_MINUTES} to ${L.MAX_HOLD_MINUTES} minutes: how long a spend carried by two clear readings waits, open to challenge, before it pays`;
  if (problem) return refusePayable(c.sender, c.value, "", problem, c.now);
  const id = "D" + ++deskCount;
  const seq = nextSeq();
  desks.set(id, {
    id, opener: c.sender, label, roster, pot: c.value, committed: 0n, drawn: 0n, fundedTotal: c.value, claimsOpen: 0n,
    claimsDue: 0n, open: [], nMembers: 0, nSpends: 0, nOpen: 0, nPaid: 0, nExpired: 0, nReadings: 0, nRefusals: 0,
    openedAt: c.now, openedSeq: seq, fundRound: 1, minNotice: floor, registries, memberStake: stake, holdMinutes: hold,
    staked: 0n, slashedIn: 0n, nHolding: 0, nChallenges: 0, nHidden: 0, nCleared: 0, nUnclear: 0,
  });
  if (c.value > 0n) funded.set(`${id}:1:${c.sender}`, c.value);
  return {
    ok: true, desk: id, label, opener: c.sender, roster, open_enrolment: !roster.length, pot: c.value.toString(), seq,
    min_notice_minutes: floor, registries, member_stake: stake.toString(), hold_minutes: hold,
  };
}

async function fund(c: Ctx, deskId: string): Promise<Row> {
  deskId = String(deskId).trim();
  const d = desks.get(deskId);
  if (!d) return refusePayable(c.sender, c.value, "", "no desk " + deskWord(deskId), c.now);
  if (c.value < 1n) return refusePayable(c.sender, c.value, deskId, "send an amount greater than zero", c.now);
  let total = d.fundedTotal;
  // What the units outstanding stand for: the pot, less what funders who left claimed on open
  // spends and less what is owed on spends that expired.
  const backing = d.pot - d.claimsOpen - d.claimsDue;
  const fresh = total > 0n && backing === 0n;
  if (fresh) total = 0n;
  const units = total === 0n ? c.value : (c.value * total) / backing;
  if (units < 1n)
    return refusePayable(c.sender, c.value, deskId, `this amount is too small to be counted as one unit of credit at the going rate on ${deskId}; send more`, c.now);
  if (fresh) d.fundRound += 1;
  const key = creditKey(d, c.sender);
  const held = funded.get(key) ?? 0n;
  funded.set(key, held + units);
  d.pot += c.value;
  d.fundedTotal = total + units;
  return {
    ok: true, desk: deskId, funder: c.sender, sent: c.value.toString(), units: units.toString(),
    credit: (held + units).toString(), round: d.fundRound, funded_total: d.fundedTotal.toString(), pot: d.pot.toString(),
  };
}

async function disclosureDigest(statement: string, entries: Entry[], addresses: string[]): Promise<string> {
  const parts = [norm(statement), ...entries.map((e) => `${norm(e.name)}|${e.relation}|${norm(e.detail)}`), addresses.join(",")];
  return digestOf(parts.join("||"));
}

/** enrol: payable with exactly the desk's member stake; every refusal returns the value and answers ok: false. */
async function enrol(c: Ctx, deskId: string, statement: string, entriesJson: string, addressesCsv: string, publicName: string): Promise<Row> {
  deskId = String(deskId).trim();
  const key = `${deskId}:${c.sender}`;
  let problem = "";
  if (members.has(key)) problem = `this address already has a disclosure on ${deskId}; amend it rather than enrolling twice`;
  if (!problem && !desks.has(deskId)) problem = "no desk " + deskWord(deskId);
  if (problem) return refusePayable(c.sender, c.value, deskId, problem, c.now);
  const d = desks.get(deskId)!;
  if (d.roster.length && !d.roster.includes(c.sender))
    problem = `${deskId} was opened with a roster of ${d.roster.length} addresses and this one is not on it; the roster was fixed when the desk was opened and nobody can change it`;
  else if (!d.roster.length && d.nMembers >= L.MAX_MEMBERS)
    problem = `${deskId} holds the most members a desk takes (${L.MAX_MEMBERS}); open a desk of your own, which needs nobody's permission`;
  statement = String(statement).trim();
  const name = String(publicName ?? "").trim();
  let entries: Entry[] = [];
  let addresses: string[] = [];
  if (!problem) {
    try {
      entries = parseEntries(entriesJson);
    } catch (e) {
      problem = problemOf(e);
    }
  }
  if (!problem) {
    try {
      addresses = parseAddresses(addressesCsv, L.MAX_DECLARED, "declared address");
    } catch (e) {
      problem = problemOf(e);
    }
  }
  if (!problem) problem = textProblem(statement, L.MIN_STATEMENT, L.MAX_STATEMENT, "the statement");
  if (!problem) problem = nameProblem(name);
  if (!problem && c.value !== d.memberStake)
    problem = `enrolling on ${deskId} stakes exactly ${d.memberStake} atto, the member stake fixed when the desk was opened; this call sent ${c.value} and it is returned`;
  if (problem) return refusePayable(c.sender, c.value, deskId, problem, c.now);
  const seq = nextSeq();
  const number = ++d.nMembers;
  d.staked += d.memberStake;
  const digest = await disclosureDigest(statement, entries, addresses);
  members.set(key, {
    who: c.sender, desk: deskId, number, statement, entries, declared: addresses, filedSeq: seq, filedAt: c.now, version: 1, digest,
    openPosted: 0, publicName: name, stake: d.memberStake, holdsOpen: 0, signedOpen: 0, hidden: 0, cleared: 0, retired: false,
  });
  memberAt.set(`${deskId}:M${number}`, key);
  return {
    ok: true, desk: deskId, member: "M" + number, who: c.sender, filed_seq: seq, version: 1, entries: entries.length, declared: addresses,
    digest, public_name: name, stake: d.memberStake.toString(), staked_on_desk: d.staked.toString(),
  };
}

async function restake(c: Ctx, deskId: string): Promise<Row> {
  deskId = String(deskId).trim();
  const m = members.get(`${deskId}:${c.sender}`);
  if (!m) return refusePayable(c.sender, c.value, deskId, `no member at this address on ${deskWord(deskId)}; enrol, which stakes, instead`, c.now);
  const d = desks.get(deskId)!;
  const missing = d.memberStake - m.stake;
  let problem = "";
  if (m.retired) problem = `this member has retired from countersigning on ${deskId}; withdraw_stake takes the stake back`;
  else if (missing < 1n) problem = `this member's stake on ${deskId} is already whole`;
  else if (c.value !== missing) problem = `this member's stake on ${deskId} is missing exactly ${missing} atto; this call sent ${c.value} and it is returned`;
  if (problem) return refusePayable(c.sender, c.value, deskId, problem, c.now);
  m.stake += missing;
  d.staked += missing;
  return { ok: true, desk: deskId, member: "M" + m.number, who: c.sender, added: missing.toString(), stake: m.stake.toString(), whole: true };
}

async function retire(c: Ctx, deskId: string): Promise<Row> {
  deskId = String(deskId).trim();
  deskOf(deskId);
  const m = members.get(`${deskId}:${c.sender}`) ?? fail(`no member at this address on ${deskId}`);
  if (m.retired) fail(`this member already retired from countersigning on ${deskId}`);
  m.retired = true;
  return {
    ok: true, desk: deskId, member: "M" + m.number, who: c.sender, retired: true, stake: m.stake.toString(), holds_open: m.holdsOpen,
    signed_open: m.signedOpen, stake_back: "withdraw_stake once no spend this member signed is open or in its hold",
  };
}

async function withdrawStake(c: Ctx, deskId: string): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const m = members.get(`${deskId}:${c.sender}`) ?? fail(`no member at this address on ${deskId}`);
  if (!m.retired) fail("only a member that has retired from countersigning takes its stake back; call retire first");
  if (m.holdsOpen > 0 || m.signedOpen > 0)
    fail(
      `this member's reading is counted on ${m.signedOpen} spends that have not ended, ${m.holdsOpen} of them in their hold; the stake stays until each is paid, expires or has that reading struck`,
    );
  const amount = m.stake;
  if (amount < 1n) fail(`this member holds no stake on ${deskId}`);
  m.stake = 0n;
  d.staked -= amount;
  credit(c.sender, amount);
  return { ok: true, desk: deskId, member: "M" + m.number, who: c.sender, withdrawn: amount.toString(), stake: "0" };
}

async function amend(c: Ctx, deskId: string, statement: string, entriesJson: string, addressesCsv: string): Promise<Row> {
  deskId = String(deskId).trim();
  deskOf(deskId);
  const row = members.get(`${deskId}:${c.sender}`) ?? fail(`no disclosure from this address on ${deskId}; enrol before amending`);
  statement = String(statement).trim();
  const entries = parseEntries(entriesJson);
  const addresses = parseAddresses(addressesCsv, L.MAX_DECLARED, "declared address");
  const problem = textProblem(statement, L.MIN_STATEMENT, L.MAX_STATEMENT, "the statement");
  if (problem) fail(problem);
  const digest = await disclosureDigest(statement, entries, addresses);
  if (digest === row.digest)
    fail("this amendment says exactly what the disclosure on file already says; a no-op amendment would only move your sequence number past every spend now open");
  const old = row.version;
  history.set(`${deskId}:${c.sender}:${old}`, { statement: row.statement, entries: row.entries, declared: row.declared, filedSeq: row.filedSeq });
  const seq = nextSeq();
  Object.assign(row, { statement, entries, declared: addresses, filedSeq: seq, filedAt: c.now, version: old + 1, digest });
  return {
    ok: true, desk: deskId, member: "M" + row.number, who: c.sender, version: old + 1, filed_seq: seq, superseded: old,
    entries: entries.length, declared: addresses, digest,
    cost: "this disclosure is now newer than every spend already posted, and than every payee address already posted and not yet paid, so it is read only against what is first posted from here on",
  };
}

async function postSpend(
  c: Ctx, deskId: string, payee: string, amount: unknown, description: string, noticeMinutes: unknown, windowMinutes: unknown,
): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const me = members.get(`${deskId}:${c.sender}`);
  if (!me) return fail(`only a member of ${deskId} may post a spend on it; enrol first, which needs nobody's permission on an open desk`);
  if (d.nMembers < L.MIN_MEMBERS_TO_POST)
    fail(`${deskId} has ${d.nMembers} members and a spend needs two countersignatures from members other than its poster, so a desk takes spends from ${L.MIN_MEMBERS_TO_POST} members onwards`);
  if (d.nOpen >= L.MAX_OPEN_SPENDS) fail(`${deskId} already has ${L.MAX_OPEN_SPENDS} open spends; wait for one to be carried or to expire`);
  if (me.openPosted >= L.MAX_OPEN_PER_POSTER)
    fail(`this member already has ${L.MAX_OPEN_PER_POSTER} spends of their own open on ${deskId}, which is the most one poster may hold; wait for one to be carried or to expire`);
  const payeeHex = String(payee).trim().toLowerCase();
  if (!isAddress(payeeHex)) fail("the payee is a 0x address of 40 hexadecimal digits and not the zero address");
  if (payeeHex === c.sender) fail("a member paying their own address needs no reading at all; this desk does not take it");
  if (payeeHex === MOCK_REGISTER) fail("the payee may not be the desk contract itself");
  const want = whole(amount);
  if (want < 1n) fail("the amount is a whole number of atto, at least 1");
  const free = d.pot - d.committed - d.claimsDue;
  if (want > free)
    fail(`${deskId} holds ${d.pot} atto with ${d.committed} already committed to open spends and ${d.claimsDue} owed to funders on spends that expired, so ${free} is free and this spend asks ${want}`);
  description = String(description).trim();
  const problem = textProblem(description, L.MIN_DESCRIPTION, L.MAX_DESCRIPTION, "the description");
  if (problem) fail(problem);
  const notice = Number(whole(noticeMinutes));
  const window = Number(whole(windowMinutes));
  const least = Math.max(L.MIN_NOTICE_MINUTES, d.minNotice);
  if (!(notice >= least && notice <= L.MAX_NOTICE_MINUTES))
    fail(`the notice window on ${deskId} is ${least} to ${L.MAX_NOTICE_MINUTES} minutes, the least of them fixed when the desk was opened; identifications are open and approvals closed until it ends`);
  if (window < notice + L.MIN_LIVE_MINUTES || window > L.MAX_WINDOW_MINUTES)
    fail(`the whole window is at least the notice window plus ${L.MIN_LIVE_MINUTES} minutes, and at most ${L.MAX_WINDOW_MINUTES}; approvals run from the end of the notice window to the end of this one`);
  const digest = await digestOf(`${payeeHex}|${want}|${norm(description)}`);
  const other = spendDigests.get(`${deskId}:${digest}`);
  const live = other ? spends.get(`${deskId}:${other}`) : undefined;
  if (other && live && LIVE.includes(live.state))
    fail(`the same payee, the same amount and the same words are already ${live.state} on ${deskId} as ${other}; once it is paid or expired the same payment may be posted again`);
  const seq = nextSeq();
  const number = ++d.nSpends;
  const posterDeclared = me.declared.includes(payeeHex);
  const skey = `${deskId}:S${number}`;
  // A spend joins the run of its payee address. The run's first posting fixes the gate, and
  // every later spend of the run keeps it, with what members already said about the payee.
  const rkey = `${deskId}:${payeeHex}`;
  let run = runOf(rkey);
  if (!run.live) {
    run = { run: run.run + 1, live: true, gate: seq, first: number, idents: [] };
    runs.set(rkey, run);
  }
  const carried: Ident[] = [];
  for (const it of run.idents) {
    if (it.by === c.sender) continue; // the poster's own word about the payee belongs in the description
    carried.push({ n: carried.length + 1, by: it.by, member: it.member, text: it.text, at: it.at, seq: it.seq, digest: it.digest, from: "S" + it.on });
    identBy.add(`${skey}:${it.by}`);
  }
  if (carried.length) idents.set(skey, carried);
  spends.set(skey, {
    desk: deskId, number, poster: c.sender, payee: payeeHex, amount: want, description, digest, docDigest: "", postedSeq: seq,
    gateSeq: run.gate, run: run.run, postedAt: c.now, noticeUntil: c.now + notice * 60, windowUntil: c.now + window * 60,
    state: "open", approvals: 0, approver1: ZERO, approver2: ZERO, nIdents: carried.length, shutOut: 0, nAttempts: 0,
    posterTried: 0, claimed: 0n, paidAt: 0, expiredAt: 0, posterDeclared, heldAt: 0, holdUntil: 0, nHolds: 0, nStruck: 0, nChallenges: 0,
  });
  spendDigests.set(`${deskId}:${digest}`, "S" + number);
  d.nOpen += 1;
  d.open.push(number);
  d.committed += want;
  me.openPosted += 1;
  return {
    ok: true, desk: deskId, spend: "S" + number, poster: c.sender, payee: payeeHex, amount: want.toString(), digest,
    posted_seq: seq, gate_seq: run.gate, run: run.run, run_first: "S" + run.first, identifications_carried: carried.length,
    notice_until: c.now + notice * 60, window_until: c.now + window * 60,
    committed: d.committed.toString(), poster_declared: posterDeclared,
  };
}

async function identify(c: Ctx, deskId: string, spend: unknown, text: string): Promise<Row> {
  deskId = String(deskId).trim();
  deskOf(deskId);
  const member = members.get(`${deskId}:${c.sender}`);
  if (!member) return fail(`only a member of ${deskId} may identify a payee on it`);
  const s = spendOf(deskId, spend);
  const label = "S" + s.number;
  if (c.sender === s.poster)
    fail(`the member who posted ${label} says who its payee is in the description; an identification is another member's word`);
  if (s.state !== "open") fail(`${label} is ${s.state} and takes no identifications`);
  if (member.filedSeq > s.gateSeq)
    fail(`this disclosure was filed at sequence number ${member.filedSeq}, after a spend to this payee address was first posted at ${s.gateSeq} and not since paid; a disclosure newer than that is never read against ${label}, and neither is its holder's word about the payee`);
  if (c.now >= s.noticeUntil)
    fail(`the notice window of ${label} closed at ${s.noticeUntil} and approvals are open, so the judged document is sealed and takes no more identifications`);
  if (s.docDigest || s.nAttempts > 0) fail(`${label} has already been read, so the judged document is sealed and takes no more identifications`);
  const key = `${deskId}:${label}`;
  const list = idents.get(key) ?? [];
  if (identBy.has(`${key}:${c.sender}`)) fail(`this address has already said, or tried to say, who the payee of ${label} is; one per member`);
  text = String(text).trim();
  const problem = textProblem(text, L.MIN_IDENT, L.MAX_IDENT, "the identification");
  if (problem) fail(problem);
  const digest = await digestOf(text);
  const same = list.find((it) => it.digest === digest);
  if (same) fail(`${label} already carries that sentence as identification ${same.n}; content is deduplicated, never the id`);
  if (list.length >= L.MAX_IDENTS) {
    // Remembered, not raised: the judged document then says how many members were turned away.
    identBy.add(`${key}:${c.sender}`);
    s.shutOut += 1;
    return {
      ok: false, recorded: true, desk: deskId, spend: label, by: c.sender, member: "M" + member.number, shut_out: s.shutOut,
      reason: `${label} already carries ${L.MAX_IDENTS} identifications; this attempt is counted on the spend and the judged document says how many members were turned away`,
    };
  }
  const seq = nextSeq();
  const n = list.length + 1;
  list.push({ n, by: c.sender, member: member.number, text, at: c.now, seq, digest, from: "" });
  idents.set(key, list);
  identBy.add(`${key}:${c.sender}`);
  s.nIdents = n;
  // Kept for the run, so a later spend to this payee address starts with what was already said.
  const run = runOf(`${deskId}:${s.payee}`);
  if (run.run === s.run && run.idents.length < L.MAX_IDENTS && !run.idents.some((x) => x.by === c.sender || x.digest === digest))
    run.idents.push({ by: c.sender, member: member.number, text, at: c.now, seq, digest, on: s.number });
  return { ok: true, desk: deskId, spend: label, n, by: c.sender, member: "M" + member.number, digest, seq, notice_until: s.noticeUntil };
}

/** End an open spend whose window has passed. No money leaves the desk. */
function expireNow(d: Desk, s: Spend, now: number): void {
  s.state = "expired";
  s.expiredAt = now;
  d.committed -= s.amount;
  d.nExpired += 1;
  // What funders who left had claimed on this spend is theirs again: money owed, kept out of the free balance.
  d.claimsOpen -= s.claimed;
  d.claimsDue += s.claimed;
  signer(d.id, s.approver1, 0, -1);
  signer(d.id, s.approver2, 0, -1);
  leaveOpen(d, s);
}

/** Whether a register page struck this member's signature on a spend of this spend's run. */
function struckInRun(s: Spend, who: string): boolean {
  if (!who || who === ZERO) return false;
  return standing.get(standingKey(s, who))?.verdict === "struck";
}

/** Mark one counted reading struck because its member stands struck in the run. Kept for the record. */
function markStruckByRun(s: Spend, who: string, now: number): void {
  const reading = readingOf(s, who);
  const earlier = standing.get(standingKey(s, who)) ?? {};
  if (!reading) return;
  reading.struck = true;
  reading.struck_by = "the run: struck on " + String(earlier.spend ?? "");
  reading.struck_at = now;
}

/** Stop counting a signature whose member was struck on another spend of the run. No slash. */
function dropStruck(d: Desk, s: Spend, now: number): string[] {
  const one = s.approver1;
  const two = s.approver2;
  const dropOne = struckInRun(s, one);
  const dropTwo = struckInRun(s, two);
  if (!dropOne && !dropTwo) return [];
  const holding = s.state === "holding";
  const ends = holding ? -1 : 0;
  const second = s.approver2;
  signer(d.id, one, ends, dropOne ? -1 : 0);
  signer(d.id, two, ends, dropTwo ? -1 : 0);
  const dropped: string[] = [];
  if (dropOne) {
    markStruckByRun(s, one, now);
    dropped.push(one);
  }
  if (dropTwo) {
    markStruckByRun(s, two, now);
    dropped.push(two);
  }
  if (dropOne) s.approver1 = dropTwo ? ZERO : second;
  s.approver2 = ZERO;
  s.approvals = Math.max(0, s.approvals - dropped.length);
  s.nStruck += dropped.length;
  if (holding) {
    s.state = "open";
    d.nHolding = Math.max(0, d.nHolding - 1);
  }
  if (now >= s.windowUntil) expireNow(d, s, now);
  return dropped;
}

function finalReading(c: Ctx, d: Desk, s: Spend, member: Member, value: string, verdict: string, docDigest: string, identsSeen: number): Row {
  const label = "S" + s.number;
  const attempt = ++s.nAttempts;
  d.nReadings += 1;
  if (docDigest && !s.docDigest) s.docDigest = docDigest;
  const row: Row = {
    desk: d.id, spend: label, member: c.sender, number: "M" + member.number, attempt, value, ifdone: value[0], ifnot: value[1],
    verdict, why: why(value, verdict), doc_digest: docDigest, idents_seen: identsSeen, filed_seq: member.filedSeq,
    posted_seq: s.postedSeq, gate_seq: s.gateSeq, run: s.run, version: member.version, at: c.now, model_asked: value !== "--",
    struck: false,
  };
  // A judged reading that is not clear stands for the rest of the run of its payee address.
  const stkey = standingKey(s, c.sender);
  if (verdict === "standing") {
    const earlier = standing.get(stkey) ?? {};
    row.stands_on = earlier.spend;
    row.stands_value = earlier.value;
    row.stands_verdict = earlier.verdict;
    row.why = `${row.why} The reading that stands is ${earlier.value}, ${earlier.verdict}, made on ${earlier.spend}.`;
  } else if ((verdict === "interested" || verdict === "unclear") && !standing.has(stkey)) {
    standing.set(stkey, { spend: label, value, verdict, at: c.now });
  }
  const key = `${d.id}:${label}`;
  readings.set(key, [...(readings.get(key) ?? []), row]);
  if (verdict !== "clear") return { ok: false, counted: false, attempt_spent: true, approvals: s.approvals, pot: d.pot.toString(), ...row };
  // A first signature struck on another spend of this run since it was counted no longer counts here.
  const dropped = dropStruck(d, s, c.now);
  const gone = dropped.length ? { dropped } : {};
  s.approvals += 1;
  if (s.approvals === 1) {
    s.approver1 = c.sender;
    signer(d.id, s.approver1, 0, 1);
    return { ok: true, counted: "1 of 2", attempt_spent: true, approvals: 1, pot: d.pot.toString(), paid: "0", ...gone, ...row };
  }
  // The second clear reading pays nothing: it starts the hold, and the amount stays committed.
  const hold = d.holdMinutes * 60;
  s.approver2 = c.sender;
  s.state = "holding";
  s.heldAt = c.now;
  s.holdUntil = c.now + hold;
  s.nHolds += 1;
  d.nHolding += 1;
  signer(d.id, s.approver2, 0, 1);
  signer(d.id, s.approver1, 1, 0);
  signer(d.id, s.approver2, 1, 0);
  return {
    ok: true, counted: "2 of 2", attempt_spent: true, approvals: 2, state: "holding", held_at: c.now, hold_until: c.now + hold, paid: "0",
    pot: d.pot.toString(), committed: d.committed.toString(), ...row,
  };
}

async function approve(c: Ctx, deskId: string, spend: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const me = c.sender;
  const d = desks.get(deskId);
  if (!d) return refuse("", me, "no desk " + deskWord(deskId), {}, c.now);
  const n = whole(spend);
  const s = n >= 1n ? spends.get(`${deskId}:S${n}`) : undefined;
  if (!s) return refuse(deskId, me, `no spend ${spendWord(spend)} on ${deskId}`, {}, c.now);
  const label = "S" + s.number;
  const extra = { spend: label };
  const member = members.get(`${deskId}:${me}`);
  if (!member) return refuse(deskId, me, `only a member of ${deskId} may countersign a spend on it`, extra, c.now);
  if (me === s.poster) {
    // Counted on the spend itself, where no ring can turn it out of sight.
    if (s.posterTried < COUNT_CEILING) s.posterTried += 1;
    return refuse(deskId, me, `the member who posted ${label} may never countersign it`, extra, c.now);
  }
  if (s.state !== "open") return refuse(deskId, me, `${label} is ${s.state} and takes no countersignatures`, extra, c.now);
  if (c.now >= s.windowUntil)
    return refuse(deskId, me, `the window of ${label} closed at ${s.windowUntil}; anybody may now call expire(${deskId}, ${s.number})`, extra, c.now);
  if (c.now < s.noticeUntil)
    return refuse(deskId, me, `the notice window of ${label} runs to ${s.noticeUntil}; until then any member but the poster whose disclosure predates the spend may identify the payee, and nobody may countersign`, extra, c.now);
  if (readingOf(s, me))
    return refuse(deskId, me, `this address already has a reading on ${label}; one attempt per member per spend, and a verdict is final`, extra, c.now);
  if (member.retired) return refuse(deskId, me, `this member retired from countersigning on ${deskId}`, extra, c.now);
  if (member.stake < d.memberStake)
    return refuse(
      deskId,
      me,
      `this member's stake on ${deskId} is ${member.stake} of the ${d.memberStake} atto the desk asks, and a member whose stake is not whole may not countersign; restake(${deskId}) tops it up`,
      extra,
      c.now,
    );
  if (s.payee === me || member.declared.includes(s.payee)) return finalReading(c, d, s, member, "--", "declared", "", 0);
  if (member.filedSeq > s.gateSeq) return finalReading(c, d, s, member, "--", "late", "", 0);
  if (standing.has(standingKey(s, me))) return finalReading(c, d, s, member, "--", "standing", "", 0);
  if (s.approvals >= 2) return refuse(deskId, me, `${label} already carries two counted countersignatures`, extra, c.now);
  const doc = spendDocument(s);
  const docDigest = await sha256(doc);
  if (s.docDigest && s.docDigest !== docDigest)
    return refuse(deskId, me, `the judged document of ${label} is not the one the first countersignature read`, extra, c.now);
  const value = scriptedValue(doc, member);
  return finalReading(c, d, s, member, value, verdictFor(value), docDigest, s.nIdents);
}

async function expire(c: Ctx, deskId: string, spend: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const s = spendOf(deskId, spend);
  if (s.state === "holding")
    fail(`S${s.number} is holding: a spend in its hold never expires; it is paid by release once the hold ends, or goes back to open if a register page strikes a signature on it`);
  if (s.state !== "open") fail(`S${s.number} is already ${s.state}`);
  if (c.now < s.windowUntil) fail(`the window of S${s.number} runs to ${s.windowUntil}, another ${s.windowUntil - c.now} seconds`);
  expireNow(d, s, c.now);
  return {
    ok: true, desk: deskId, spend: "S" + s.number, state: "expired", uncommitted: s.amount.toString(), approvals: s.approvals,
    pot: d.pot.toString(), committed: d.committed.toString(), owed_to_funders_who_left: s.claimed.toString(),
    note: "no money left the desk; the amount simply stopped being committed",
  };
}

async function reclaim(c: Ctx, deskId: string): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const me = c.sender;
  const key = creditKey(d, me);
  const lkey = `${deskId}:${me}`;
  if (!funded.has(key) && !claimLists.has(lkey)) fail("this address has no funder credit on " + deskId);
  const held = funded.get(key) ?? 0n;
  const mine = claimsOf(deskId, me);
  const due = mine.filter((x) => x.state === "expired").reduce((sum, x) => sum + x.amount, 0n);
  const waiting = mine.filter((x) => LIVE.includes(x.state)).map((x) => x.n);
  if (held < 1n && due < 1n && !waiting.length) fail("this address has already reclaimed its credit on " + deskId);
  const total = d.fundedTotal;
  const free = d.pot - d.committed - d.claimsDue;
  const share = total > 0n && held > 0n ? (free * held) / total : 0n;
  if (share + due < 1n)
    fail(`${deskId} holds ${d.pot} atto with ${d.committed} committed to open spends and ${d.claimsDue} owed on spends that expired, against ${total} units of credit, so this credit of ${held} would pay nothing now; the credit is kept, and a claim on an open spend waits for that spend to end`);
  for (const x of mine) if (x.state === "expired") claims.set(`${deskId}:S${x.n}:${me}`, 0n);
  d.claimsDue -= due;
  let givenUp = 0n;
  let claimedNow = 0n;
  if (share > 0n) {
    // What the units stood for in each open spend becomes a claim on that spend alone.
    for (const n of d.open) {
      const s = spends.get(`${deskId}:S${n}`);
      if (!s) continue;
      const part = ((s.amount - s.claimed) * held) / total;
      if (part < 1n) continue;
      const ckey = `${deskId}:S${n}:${me}`;
      claims.set(ckey, (claims.get(ckey) ?? 0n) + part);
      s.claimed += part;
      claimedNow += part;
      if (!waiting.includes(n)) waiting.push(n);
    }
    givenUp = held;
    d.claimsOpen += claimedNow;
    d.fundedTotal = total - givenUp;
    funded.set(key, held - givenUp);
  }
  claimLists.set(lkey, waiting);
  d.pot -= share + due;
  credit(me, share + due);
  return {
    ok: true, desk: deskId, funder: me, credit: held.toString(), units_given_up: givenUp.toString(),
    credit_left: (held - givenUp).toString(), reclaimed: (share + due).toString(), from_free_balance: share.toString(),
    from_expired_spends: due.toString(), claimed_on_open_spends: claimedNow.toString(), waiting_on: waiting.map((n) => "S" + n),
    pot: d.pot.toString(), committed: d.committed.toString(), funded_total: d.fundedTotal.toString(),
  };
}

/** Pay a spend whose hold has ended: latch it paid, do the desk's arithmetic, then transfer. */
function pay(d: Desk, s: Spend, now: number): void {
  s.state = "paid";
  s.paidAt = now;
  d.pot -= s.amount;
  d.committed -= s.amount;
  d.drawn += s.amount;
  d.nPaid += 1;
  d.nHolding = Math.max(0, d.nHolding - 1);
  // A funder who left while this spend was open or holding bears their part of it: their claim on it is void.
  d.claimsOpen -= s.claimed;
  totals.released += 1;
  signer(d.id, s.approver1, -1, -1);
  signer(d.id, s.approver2, -1, -1);
  leaveOpen(d, s);
  // The payment ends the run of this payee address: the next spend to it is a new question.
  const run = runs.get(`${d.id}:${s.payee}`);
  if (run && run.live && run.run === s.run) run.live = false;
  credit(s.payee, s.amount);
}

async function release(c: Ctx, deskId: string, spend: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const s = spendOf(deskId, spend);
  const label = "S" + s.number;
  if (s.state !== "holding") fail(`${label} is ${s.state}; only a spend in its hold is released`);
  if (c.now < s.holdUntil)
    fail(`the hold of ${label} runs to ${s.holdUntil}, another ${s.holdUntil - c.now} seconds; until then anyone may cite a page of one of the desk's registers against either counted signature`);
  const dropped = dropStruck(d, s, c.now);
  if (dropped.length)
    return {
      ok: false, desk: deskId, spend: label, released: false, paid: "0", dropped, state: s.state, approvals: s.approvals,
      reason: `a counted signature on ${label} was struck by a register page on another spend to this payee address in this run, so it no longer counts; ${label} needs another clear reading before it can hold again`,
    };
  const amount = s.amount;
  pay(d, s, c.now);
  return {
    ok: true, desk: deskId, spend: label, state: "paid", paid: amount.toString(), to: s.payee, approver1: s.approver1, approver2: s.approver2,
    hold_until: s.holdUntil, challenges: s.nChallenges, pot: d.pot.toString(), committed: d.committed.toString(),
  };
}

async function deposit(c: Ctx): Promise<Row> {
  if (c.value < 1n) return refusePayable(c.sender, c.value, "", "send the bond credit to add with the call", c.now);
  const held = bondOf(c.sender) + c.value;
  bondCredit.set(c.sender, held);
  totals.bond += c.value;
  return { ok: true, address: c.sender, added: c.value.toString(), bond_credit: held.toString(), challenges_covered: Number(held / CHALLENGE_BOND) };
}

async function withdraw(c: Ctx): Promise<Row> {
  const amount = bondOf(c.sender);
  if (amount < 1n) fail("this address holds no bond credit");
  bondCredit.set(c.sender, 0n);
  totals.bond -= amount;
  credit(c.sender, amount);
  return { ok: true, address: c.sender, withdrawn: amount.toString(), bond_credit: "0" };
}

/** Strike one counted reading: kept for the record, no longer counted, and standing for the run. */
function strike(d: Desk, s: Spend, target: Member, reading: Row, k: number, now: number): void {
  const who = target.who;
  const label = "S" + s.number;
  reading.struck = true;
  reading.struck_by = "challenge " + k;
  reading.struck_at = now;
  const other = who === s.approver1 ? s.approver2 : s.approver1;
  signer(d.id, who, -1, -1);
  signer(d.id, other, -1, 0);
  s.approver1 = other;
  s.approver2 = ZERO;
  s.approvals = 1;
  s.nStruck += 1;
  s.state = "open";
  d.nHolding = Math.max(0, d.nHolding - 1);
  const stkey = standingKey(s, who);
  if (!standing.has(stkey)) standing.set(stkey, { spend: label, value: String(reading.value ?? ""), verdict: "struck", at: now });
  if (now >= s.windowUntil) expireNow(d, s, now);
}

async function challenge(c: Ctx, deskId: string, spend: unknown, memberNo: unknown, url: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const s = spendOf(deskId, spend);
  const label = "S" + s.number;
  const me = c.sender;
  if (s.state !== "holding") fail(`${label} is ${s.state}; a register page is read only against a spend in its hold`);
  if (c.now >= s.holdUntil) fail(`the hold of ${label} ended at ${s.holdUntil}; anybody may now call release(${deskId}, ${s.number})`);
  const raw = String(memberNo).trim();
  const number = Number(whole(raw.startsWith("M") ? raw.slice(1) : raw));
  const at = `${deskId}:M${number}`;
  if (number < 1 || !memberAt.has(at)) fail(`no member ${number >= 1 ? "M" + number : "(not a number)"} on ${deskId}`);
  const target = members.get(memberAt.get(at)!)!;
  const who = target.who;
  if (who !== s.approver1 && who !== s.approver2)
    fail(`the reading of M${number} is not one of the two counted on ${label}; only a counted signature can be struck`);
  if (me === who) fail("a member may not challenge their own countersignature");
  const pageUrl = String(url).trim();
  const problem = urlProblem(pageUrl, L.MAX_URL, "the page address");
  if (problem) fail(problem);
  if (!under(pageUrl, d.registries))
    fail(
      `the page is not below one of the registers ${deskId} named when it was opened (${d.registries.slice(0, L.MAX_REGISTRIES).join(", ")}); only those are read, and the desk named them before any spend existed`,
    );
  const seenKey = `${deskId}:${label}:${who}:${(await sha256(pageUrl)).slice(0, 32)}`;
  if (challengeSeen.has(seenKey))
    fail(`this page was already read against the signature of M${number} on ${label}, as challenge ${challengeSeen.get(seenKey)}; each page is read once against each signature`);
  const held = bondOf(me);
  if (held < CHALLENGE_BOND)
    fail(`a challenge stakes a bond of ${CHALLENGE_BOND} atto (0.05 GEN) from bond credit, and this address holds ${held}; deposit() adds credit`);
  const reading = readingOf(s, who)!;
  const spendDoc = spendDocument(s);
  if ((await sha256(spendDoc)) !== s.docDigest) fail(`the spend document of ${label} is not the one its readings sealed`);
  // The register round. Every validator fetches the page itself; a page that cannot be read is a
  // failed round nobody agrees with, so nothing below this line happens.
  const page = fetchPage(pageUrl);
  if (page === null) throw new Unsettled("[TRANSIENT] the page answered with status 404; an error page is not a register page, nothing was stored and no bond was taken");
  const finding = scriptedFinding(page, spendDoc, disclosureAtSigning(target, reading), target.publicName);
  const fp = (await sha256(page)).slice(0, L.FP_CHARS);
  return settleChallenge(c, d, s, target, reading, pageUrl, seenKey, finding, fp);
}

/** Write what a register round found and move the money it moves. Latches precede transfers. */
function settleChallenge(c: Ctx, d: Desk, s: Spend, target: Member, reading: Row, pageUrl: string, seenKey: string, finding: string, fp: string): Row {
  const me = c.sender;
  const who = target.who;
  const label = "S" + s.number;
  const k = ++s.nChallenges;
  d.nChallenges += 1;
  totals.challenges += 1;
  challengeSeen.set(seenKey, String(k));
  const fpKey = `${d.id}:${label}:${who}:fp:${fp}`;
  const repeatOf = fp && challengeSeen.has(fpKey) ? challengeSeen.get(fpKey)! : "";
  if (fp && !repeatOf) challengeSeen.set(fpKey, String(k));
  const outcome = repeatOf ? "repeat" : finding;
  let slashed = 0n;
  let bounty = 0n;
  let toDesk = 0n;
  let bondTo = me;
  if (outcome === "hidden") {
    slashed = target.stake;
    bounty = slashed / 2n;
    // No funder holds credit in this desk, so the challenger takes the whole stake.
    if (d.fundedTotal < 1n) bounty = slashed;
    toDesk = slashed - bounty;
    target.stake = 0n;
    target.hidden += 1;
    d.staked -= slashed;
    d.pot += toDesk;
    d.slashedIn += toDesk;
    d.nHidden += 1;
    totals.hidden += 1;
    totals.bounties += bounty;
    strike(d, s, target, reading, k, c.now);
  } else if (outcome === "clean") {
    bondCredit.set(me, bondOf(me) - CHALLENGE_BOND);
    totals.bond -= CHALLENGE_BOND;
    totals.bondsToMembers += CHALLENGE_BOND;
    target.cleared += 1;
    d.nCleared += 1;
    totals.cleared += 1;
    bondTo = who;
  } else if (outcome === "unclear") {
    d.nUnclear += 1;
    totals.unclear += 1;
  }
  const row: Row = {
    n: k, desk: d.id, spend: label, member: "M" + target.number, member_addr: who, public_name: target.publicName, challenger: me,
    url: pageUrl, verdict: outcome, read_as: finding, fp, repeat_of: repeatOf ? Number(repeatOf) : 0, hold: s.nHolds, at: c.now,
    bond: CHALLENGE_BOND.toString(), bond_to: bondTo, slashed: slashed.toString(), bounty: bounty.toString(), to_desk: toDesk.toString(),
    state_after: s.state,
  };
  const key = `${d.id}:${label}`;
  challengeRows.set(key, [...(challengeRows.get(key) ?? []), row]);
  if (bounty > 0n) credit(me, bounty);
  if (outcome === "clean") credit(who, CHALLENGE_BOND);
  return { ok: true, ...row, approvals: s.approvals, pot: d.pot.toString(), bond_credit: bondOf(me).toString() };
}

async function run(fn: WriteFn, args: (string | number)[], c: Ctx): Promise<Row> {
  const a = args.map((x) => String(x));
  switch (fn) {
    case "open_desk": return openDesk(c, a[0], a[1] ?? "", a[2] ?? "", a[3] ?? "", a[4] ?? "", a[5] ?? "");
    case "fund": return fund(c, a[0]);
    case "enrol": return enrol(c, a[0], a[1], a[2], a[3] ?? "", a[4] ?? "");
    case "restake": return restake(c, a[0]);
    case "retire": return retire(c, a[0]);
    case "withdraw_stake": return withdrawStake(c, a[0]);
    case "amend": return amend(c, a[0], a[1], a[2], a[3] ?? "");
    case "post_spend": return postSpend(c, a[0], a[1], a[2], a[3], a[4], a[5]);
    case "identify": return identify(c, a[0], a[1], a[2]);
    case "approve": return approve(c, a[0], a[1]);
    case "expire": return expire(c, a[0], a[1]);
    case "reclaim": return reclaim(c, a[0]);
    case "release": return release(c, a[0], a[1]);
    case "deposit": return deposit(c);
    case "withdraw": return withdraw(c);
    case "challenge": return challenge(c, a[0], a[1], a[2], a[3]);
  }
}

// ---- the demo content ----------------------------------------------------------------

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

let seeded: Promise<void> | null = null;
function ready(): Promise<void> {
  if (!seeded) seeded = seed();
  return seeded;
}

async function seed(): Promise<void> {
  const t0 = clockNow();
  const at = (sender: string, now: number, value = 0n): Ctx => ({ sender, value, now });
  const D = "D1";
  const STAKE = GEN / 2n;
  const register = everydayRegistry();

  await openDesk(at(TEACHER, t0 - 9 * DAY, 400n * GEN), "Larch Court Tenants' Association", "", 5, JSON.stringify([register]), STAKE.toString(), 90);
  await enrol(
    at(PRINTER, t0 - 9 * DAY + 20 * MIN, STAKE), D,
    "I co-own Pelican Press, the print shop on Quay Street, with my sister. We print flyers, posters and newsletters for local groups, and the shop is most of my income.",
    JSON.stringify([
      { name: "Pelican Press", relation: "part_owns", detail: "a print shop on Quay Street; I hold half of it" },
      { name: "Quay Street Traders' Circle", relation: "member_of", detail: "the shop pays a yearly subscription" },
    ]),
    PRINT_SHOP_TILL, "Mara Quist",
  );
  await enrol(
    at(BIKE_CHAIR, t0 - 9 * DAY + 45 * MIN, STAKE), D,
    "I chair the Larch Court Bike Group, an unpaid role. The group runs a repair evening in the basement once a month and applies to this fund for tools and parts. I have no paid work connected to the building.",
    JSON.stringify([
      { name: "Larch Court Bike Group", relation: "officer_of", detail: "I chair it and sign its funding requests" },
      { name: "Riverside Cycle Co-op", relation: "buys_from", detail: "where the group buys parts at a member discount" },
    ]),
    "", "Tomas Brandt",
  );
  await enrol(
    at(TEACHER, t0 - 9 * DAY + 70 * MIN, STAKE), D,
    "I teach mathematics at Alder Lane Primary School and have lived in the building for six years. I own no business and sit on no committee outside this association.",
    JSON.stringify([{ name: "Alder Lane Primary School", relation: "employed_by", detail: "full-time class teacher" }]),
    "", "Elin Varga",
  );
  await enrol(
    at(NURSE, t0 - 9 * DAY + 3 * HOUR, STAKE), D,
    "I work nights as a nurse at St Brendan's Hospital. I rent my flat like everyone else here and I have no stake in any supplier the association uses.",
    JSON.stringify([
      { name: "St Brendan's Hospital", relation: "employed_by", detail: "" },
      { name: "Larch Court Housing Co-operative", relation: "tenant_of", detail: "flat 9, the same landlord as every member" },
    ]),
    "", "Ines Corrie",
  );
  await fund(at(NURSE, t0 - 9 * DAY + 4 * HOUR, 200n * GEN), D);

  // S1: one clear reading, then the window ran out. No money left the desk.
  await postSpend(
    at(PRINTER, t0 - 8 * DAY), D, HALL, 60n * GEN,
    "Hire of the Dunmore community hall for the annual general meeting, three hours on a weekday evening, chairs included.",
    60, 2880,
  );
  await approve(at(TEACHER, t0 - 8 * DAY + 5 * HOUR), D, 1);
  await expire(at(PRINTER, t0 - 6 * DAY + 2 * HOUR), D, 1);

  // S2: the print job. The payee is an address the print shop co-owner declared, so that member
  // is refused with no model asked; two other members read clear, the spend holds for the desk's
  // hold, and the release pays it.
  await postSpend(
    at(BIKE_CHAIR, t0 - 3 * DAY), D, PRINT_SHOP_TILL, 85n * GEN,
    "Printing 400 copies of the spring newsletter and 60 posters for the annual general meeting, quoted at 85 GEN including paper.",
    120, 4320,
  );
  await identify(at(TEACHER, t0 - 3 * DAY + 30 * MIN), D, 2, "The payee is Pelican Press, the print shop on Quay Street that member M1 co-owns.");
  await approve(at(PRINTER, t0 - 3 * DAY + 3 * HOUR), D, 2);
  await approve(at(TEACHER, t0 - 3 * DAY + 5 * HOUR), D, 2);
  await approve(at(NURSE, t0 - 2 * DAY), D, 2);
  await release(at(BIKE_CHAIR, t0 - 2 * DAY + 2 * HOUR), D, 2);

  // S3: tools for the bike group. Its chair declared no address, so nothing is refused at the
  // door: the reading itself finds the group among what the chair filed. A neighbour who
  // enrolled after the spend was posted is refused on sequence order alone. One clear so far.
  await postSpend(
    at(NURSE, t0 - 20 * HOUR), D, BIKE_GROUP_ACCOUNT, 140n * GEN,
    "Twelve tyre levers, two floor pumps and a wheel truing stand for the monthly repair evening in the basement.",
    180, 4320,
  );
  await identify(at(TEACHER, t0 - 19 * HOUR), D, 3, "The payee is the account of the Larch Court Bike Group, held by its treasurer.");
  await enrol(
    at(TRANSLATOR, t0 - 15 * HOUR, STAKE), D,
    "I moved into flat 14 in August and work from home as a translator. I do no business with the association or with anyone who supplies it.",
    JSON.stringify([{ name: "Harrow and Finch Translations", relation: "owns", detail: "my own one-person translation practice" }]),
    "", "Noor Hadley",
  );
  await approve(at(BIKE_CHAIR, t0 - 12 * HOUR), D, 3);
  await approve(at(TRANSLATOR, t0 - 10 * HOUR), D, 3);
  await approve(at(TEACHER, t0 - 6 * HOUR), D, 3);
  // The poster tried too, and the refusal ring remembers it.
  await approve(at(NURSE, t0 - 5 * HOUR), D, 3);

  // S4: refreshments from Gull Catering. The print shop co-owner (public name Mara Quist) is a
  // director of Gull Catering and never said so, so she reads clear like the bike group chair, and
  // the spend is in its hold now. Two pages have been cited already: one that does not name the
  // chair (unclear) and one that names her only for the print shop she filed (clean, so the bond
  // went to her). The demonstration register's Gull Catering page is still there to be cited.
  await postSpend(
    at(TEACHER, t0 - 50 * MIN), D, GULL, 45n * GEN,
    "Refreshments for the street open day from Gull Catering Ltd, sandwiches and tea for sixty.",
    5, 240,
  );
  await approve(at(PRINTER, t0 - 44 * MIN), D, 4);
  await approve(at(BIKE_CHAIR, t0 - 40 * MIN), D, 4);
  await deposit(at(TRANSLATOR, t0 - 36 * MIN, GEN / 5n));
  await challenge(at(TRANSLATOR, t0 - 34 * MIN), D, 4, "M2", register + "heron-signs-ltd.html");
  await deposit(at(NURSE, t0 - 30 * MIN, GEN / 10n));
  await challenge(at(NURSE, t0 - 28 * MIN), D, 4, "M1", register + "pelican-press-ltd.html");

  // S5: posted two minutes ago, still in its notice window, and nobody has said who the payee is.
  await postSpend(
    at(TEACHER, t0 - 2 * MIN), D, LOCKSMITH, 38n * GEN,
    "Replacement lock and three keys for the bike shed door after the break-in on the ground floor.",
    6, 90,
  );

  // A second, smaller desk with a fixed roster, so the desk list shows both kinds.
  await openDesk(
    at(NURSE, t0 - 4 * DAY, 75n * GEN), "Stairwell B Garden Box", [NURSE, TEACHER, TRANSLATOR].join(","), 60,
    JSON.stringify([register, registryPrefixAt("main").replace("/registry/", "/docs/")]), (GEN / 10n).toString(), 30,
  );
  await enrol(
    at(NURSE, t0 - 4 * DAY + 10 * MIN, GEN / 10n), "D2",
    "I work nights as a nurse at St Brendan's Hospital and look after the planters outside stairwell B at weekends.",
    JSON.stringify([{ name: "St Brendan's Hospital", relation: "employed_by", detail: "" }]),
    "", "Ines Corrie",
  );
}

// ---- views, in the contract's JSON shapes -------------------------------------------

const spendRow = (s: Spend): Row => ({
  spend: "S" + s.number, payee: s.payee, amount: s.amount.toString(), state: s.state, approvals: s.approvals,
  n_idents: s.nIdents, n_attempts: s.nAttempts, poster: s.poster, run: s.run, gate_seq: s.gateSeq,
  notice_until: s.noticeUntil, window_until: s.windowUntil, hold_until: s.holdUntil, struck: s.nStruck, challenges: s.nChallenges,
});

const memberRow = (m: Member): Row => ({
  member: "M" + m.number, who: m.who, filed_seq: m.filedSeq, version: m.version, n_entries: m.entries.length,
  n_declared: m.declared.length, digest: m.digest, open_spends_posted: m.openPosted, public_name: m.publicName,
  stake: m.stake.toString(), holds_open: m.holdsOpen, hidden: m.hidden, cleared: m.cleared, retired: m.retired,
});

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  await ready();
  await delay(90);
  const a = args.map((x) => String(x).trim());
  const now = clockNow();
  const deskId = a[0] ?? "";
  const d = desks.get(deskId);
  const noDesk = { error: "no desk " + deskWord(deskId) };
  const n = whole(a[1] ?? "");
  const s = n >= 0n ? spends.get(`${deskId}:S${n}`) : undefined;
  const noSpend = { error: `no spend ${spendWord(a[1] ?? "")} on ${deskWord(deskId)}` };
  switch (fn) {
    case "desks":
    case "desks_from": {
      const start = fn === "desks" ? Math.max(1, deskCount - L.PAGE + 1) : Math.max(1, Number(whole(a[0] ?? "")));
      const rows = [...desks.values()].slice(start - 1, start - 1 + L.PAGE).map((x) => ({
        desk: x.id, label: x.label, pot: x.pot.toString(), members: x.nMembers, open_spends: x.nOpen, open_enrolment: !x.roster.length,
        min_notice_minutes: x.minNotice, member_stake: x.memberStake.toString(), hold_minutes: x.holdMinutes,
      }));
      return JSON.stringify({ count: deskCount, first: start, rows });
    }
    case "desk":
      if (!d) return JSON.stringify(noDesk);
      return JSON.stringify({
        desk: d.id, label: d.label, opener: d.opener, roster: d.roster, open_enrolment: !d.roster.length, pot: d.pot.toString(),
        committed: d.committed.toString(), claims_open: d.claimsOpen.toString(), claims_due: d.claimsDue.toString(),
        free: (d.pot - d.committed - d.claimsDue).toString(), drawn: d.drawn.toString(),
        funded_total: d.fundedTotal.toString(), members: d.nMembers, spends: d.nSpends, open_spends: d.nOpen,
        open: d.open.map((x) => "S" + x), paid: d.nPaid,
        expired: d.nExpired, readings: d.nReadings, refusals: d.nRefusals, opened_at: d.openedAt, opened_seq: d.openedSeq,
        fund_round: d.fundRound, min_notice_minutes: d.minNotice, registries: d.registries, member_stake: d.memberStake.toString(),
        hold_minutes: d.holdMinutes, staked: d.staked.toString(), slashed_in: d.slashedIn.toString(), holding: d.nHolding,
        challenges: d.nChallenges, hidden: d.nHidden, cleared: d.nCleared, unclear: d.nUnclear, seq_now: seqCount, now,
      });
    case "member": {
      const m = members.get(`${deskId}:${(a[1] ?? "").toLowerCase()}`);
      if (!m) return JSON.stringify({ error: `no disclosure from ${addressWord(a[1] ?? "")} on ${deskWord(deskId)}` });
      return JSON.stringify({
        desk: deskId, member: "M" + m.number, who: m.who, statement: m.statement,
        entries: m.entries.map((e) => ({ ...e, relation_phrase: RELATION_PHRASE[e.relation] })), declared: m.declared,
        n_entries: m.entries.length, n_declared: m.declared.length, filed_seq: m.filedSeq, filed_at: m.filedAt,
        version: m.version, digest: m.digest, open_spends_posted: m.openPosted, public_name: m.publicName,
        stake: m.stake.toString(), stake_whole: !!d && m.stake >= d.memberStake, holds_open: m.holdsOpen, signed_open: m.signedOpen,
        hidden: m.hidden, cleared: m.cleared, retired: m.retired,
      });
    }
    case "members": {
      if (!d) return JSON.stringify(noDesk);
      const rows = [];
      for (let k = 1; k <= Math.min(d.nMembers, L.PAGE); k++) {
        const m = members.get(memberAt.get(`${deskId}:M${k}`) ?? "");
        if (m) rows.push(memberRow(m));
      }
      return JSON.stringify({ desk: deskId, count: d.nMembers, rows });
    }
    case "spend": {
      if (!s) return JSON.stringify(noSpend);
      const one = readingOf(s, s.approver1) ?? {};
      const two = readingOf(s, s.approver2) ?? {};
      return JSON.stringify({
        desk: deskId, ...spendRow(s), poster: s.poster, description: s.description, digest: s.digest, doc_digest: s.docDigest,
        posted_seq: s.postedSeq, posted_at: s.postedAt, approver1: s.approver1, approver2: s.approver2,
        approver1_value: String(one.value ?? ""), approver2_value: String(two.value ?? ""),
        approver1_struck: !!one.struck, approver2_struck: !!two.struck, holding: s.state === "holding", held_at: s.heldAt,
        holds: s.nHolds, shut_out: s.shutOut, poster_tried: s.posterTried, claimed: s.claimed.toString(),
        poster_declared: s.posterDeclared, paid_at: s.paidAt, expired_at: s.expiredAt, now,
      });
    }
    case "spends": {
      if (!d) return JSON.stringify(noDesk);
      const first = Math.max(1, d.nSpends - L.PAGE + 1);
      const rows = [];
      for (let k = first; k <= Math.min(d.nSpends, first + L.PAGE - 1); k++) {
        const x = spends.get(`${deskId}:S${k}`);
        if (x) rows.push(spendRow(x));
      }
      return JSON.stringify({ desk: deskId, count: d.nSpends, first, rows, now });
    }
    case "reading": {
      const r = s ? readingOf(s, (a[2] ?? "").toLowerCase()) : undefined;
      return JSON.stringify(r ? { ok: true, ...r } : { ok: false, reason: "no reading from that address on that spend" });
    }
    case "readings":
      if (!s) return JSON.stringify(noSpend);
      return JSON.stringify({
        desk: deskId, spend: "S" + s.number, count: s.nAttempts, poster_tried: s.posterTried,
        rows: (readings.get(`${deskId}:S${s.number}`) ?? []).slice(0, L.MAX_MEMBERS),
      });
    case "run": {
      if (!d) return JSON.stringify(noDesk);
      const r = runOf(`${deskId}:${(a[1] ?? "").toLowerCase()}`);
      return JSON.stringify({
        desk: deskId, payee: addressWord(a[1] ?? ""), run: r.run, live: r.live, gate_seq: r.gate, first: r.first > 0 ? "S" + r.first : "",
        identifications: r.idents,
      });
    }
    case "document": {
      if (!s) return JSON.stringify(noSpend);
      const text = spendDocument(s);
      return JSON.stringify({
        desk: deskId, spend: "S" + s.number, document: text, digest: await sha256(text), sealed_digest: s.docDigest,
        document_in_second_order: spendDocument(s, true),
        sealed: !!s.docDigest, identifications_open: now < s.noticeUntil && s.state === "open" && s.nAttempts === 0,
        approvals_open: now >= s.noticeUntil && now < s.windowUntil && s.state === "open", now,
      });
    }
    case "idents":
      if (!s) return JSON.stringify(noSpend);
      return JSON.stringify({
        desk: deskId, spend: "S" + s.number, count: s.nIdents, shut_out: s.shutOut, rows: idents.get(`${deskId}:S${s.number}`) ?? [],
        notice_until: s.noticeUntil, now,
      });
    case "refusals":
      return JSON.stringify((refusals.get(deskId) ?? []).filter(Boolean).sort((x, y) => Number(x.seq) - Number(y.seq)));
    case "credit": {
      if (!d) return JSON.stringify(noDesk);
      const who = (a[1] ?? "").toLowerCase();
      const held = funded.get(creditKey(d, who)) ?? 0n;
      const mine = claimsOf(deskId, who);
      const due = mine.filter((x) => x.state === "expired").reduce((sum, x) => sum + x.amount, 0n);
      const free = d.pot - d.committed - d.claimsDue;
      const share = d.fundedTotal > 0n && held > 0n ? (free * held) / d.fundedTotal : 0n;
      return JSON.stringify({
        desk: deskId, funder: addressWord(who), credit: held.toString(), round: d.fundRound, funded_total: d.fundedTotal.toString(),
        pot: d.pot.toString(), committed: d.committed.toString(), claims_due: d.claimsDue.toString(), free: free.toString(),
        share_of_free: share.toString(), due_from_expired: due.toString(),
        claims: mine.map((x) => ({ spend: "S" + x.n, amount: x.amount.toString(), state: x.state })),
        would_pay: (share + due).toString(), reclaimable_now: share + due > 0n, open_spends: d.nOpen,
      });
    }
    case "challenges_of": {
      if (!s) return JSON.stringify(noSpend);
      const total = s.nChallenges;
      const offset = Number(whole(a[2] ?? ""));
      const limit = Number(whole(a[3] ?? ""));
      const first = Math.max(0, offset) + 1;
      const size = Math.max(1, Math.min(limit, L.PAGE));
      const rows = (challengeRows.get(`${deskId}:S${s.number}`) ?? []).slice(first - 1, Math.min(total, first + size - 1));
      return JSON.stringify({
        desk: deskId, spend: "S" + s.number, count: total, offset: first - 1, limit: size, rows, state: s.state, hold_until: s.holdUntil, now,
      });
    }
    case "bond_credit_of": {
      const who = (a[0] ?? "").toLowerCase();
      const held = isAddress(who) ? bondOf(who) : 0n;
      return JSON.stringify({ address: addressWord(who), bond_credit: held.toString(), bond: CHALLENGE_BOND.toString(), challenges_covered: Number(held / CHALLENGE_BOND) });
    }
    case "stats":
      return JSON.stringify({
        desks: deskCount, sequence: seqCount, challenges: totals.challenges, hidden: totals.hidden, cleared: totals.cleared, unclear: totals.unclear,
        released: totals.released, bond_credit: totals.bond.toString(), bounties_paid: totals.bounties.toString(),
        bonds_to_members: totals.bondsToMembers.toString(), open_refusals_recorded: openRefusals,
      });
    case "rule":
      return JSON.stringify({
        limits: {
          statement: [L.MIN_STATEMENT, L.MAX_STATEMENT], entries: [L.MIN_ENTRIES, L.MAX_ENTRIES],
          entry_name: [L.MIN_ENTRY_NAME, L.MAX_ENTRY_NAME], entry_detail: L.MAX_ENTRY_DETAIL, other_detail: L.MIN_OTHER_DETAIL,
          declared_addresses: L.MAX_DECLARED, description: [L.MIN_DESCRIPTION, L.MAX_DESCRIPTION],
          identification: [L.MIN_IDENT, L.MAX_IDENT], identifications_per_spend: L.MAX_IDENTS, members_per_desk: L.MAX_MEMBERS,
          members_to_post: L.MIN_MEMBERS_TO_POST, open_spends_per_desk: L.MAX_OPEN_SPENDS,
          open_spends_per_poster: L.MAX_OPEN_PER_POSTER,
          notice_minutes: [L.MIN_NOTICE_MINUTES, L.MAX_NOTICE_MINUTES],
          desk_minimum_notice_minutes: [L.MIN_NOTICE_MINUTES, L.MAX_NOTICE_MINUTES], live_minutes_after_notice: L.MIN_LIVE_MINUTES,
          window_minutes: L.MAX_WINDOW_MINUTES, refusals_kept: L.REFUSALS_KEPT,
          member_stake_atto: [Number(MIN_STAKE), Number(MAX_STAKE)], hold_minutes: [L.MIN_HOLD_MINUTES, L.MAX_HOLD_MINUTES],
          registries: [1, L.MAX_REGISTRIES], registry_prefix_characters: L.MAX_REGISTRY, page_address_characters: L.MAX_URL,
          public_name: [L.MIN_PUBLIC_NAME, L.MAX_PUBLIC_NAME], challenge_bond_atto: Number(CHALLENGE_BOND),
          raw_page_characters: L.MAX_RAW_PAGE, page_characters: L.MAX_PAGE_TEXT, fingerprint_hex: L.FP_CHARS, rows_per_page: L.PAGE,
        },
        relations: RELATION_PHRASE,
        register: { when: "while a spend is in its hold: from the second clear reading to hold_until", scripted: "demo mode judges a page by a fixed rule, not by validators" },
      });
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ----------------------------------------------------------------------

const pending = new Map<string, { fn: string; polls: number; result: Row; error: string; split: boolean }>();
let txCount = 0;
const fakeHash = () => "0x" + (++txCount).toString(16).padStart(8, "0") + "d3a1".repeat(14);

/** `as` signs as another address than the demo account in use: the practice desk's page-held members. */
export async function write(fn: WriteFn, args: (string | number)[], value: bigint, as?: string): Promise<string> {
  await ready();
  await delay(250);
  const sender = (as || persona).toLowerCase();
  if (value > balance(sender)) throw new Error("insufficient funds for this demo account");
  if (value > 0n) credit(sender, -value);
  let result: Row = {};
  let error = "";
  let split = false;
  try {
    result = await run(fn, args, { sender, value, now: clockNow() });
  } catch (e) {
    if (!(e instanceof Refused) && !(e instanceof Unsettled)) throw e;
    // A raised refusal changes nothing, returns what was sent, and leaves its sentence in the receipt.
    // A round no validator agreed with stores nothing either.
    if (value > 0n) credit(sender, value);
    error = e.message;
    split = e instanceof Unsettled;
  }
  const hash = fakeHash();
  pending.set(hash, { fn, polls: 0, result, error, split });
  return hash;
}

export async function deploy(): Promise<string> {
  await delay(250);
  const hash = fakeHash();
  pending.set(hash, { fn: "deploy", polls: 0, result: {}, error: "", split: false });
  return hash;
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };
const JUDGED = ["approve", "challenge"];

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // As on Studio, the result can be read from ACCEPTED on, one stage before FINALIZED.
  const done = p.polls >= STAGES.length - 1;
  if (p.split) {
    // The validators did not agree: the leader's page could not be read, so nobody agreed with it.
    const disagree = Math.min(p.polls, 4);
    return {
      status: done ? "UNDETERMINED" : STAGES[Math.min(p.polls - 1, 3)],
      votes: { agree: 0, disagree, idle: 5 - disagree },
      applied: done ? false : null,
      undetermined: done,
      exec: null,
      result: null,
      message: done ? p.error : "",
    };
  }
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = JUDGED.includes(p.fn) ? Math.min(p.polls, 4) : done ? 4 : 0;
  return {
    status: STAGES[Math.min(p.polls - 1, STAGES.length - 1)],
    votes: { agree, disagree: 0, idle: 5 - agree },
    applied: done ? true : null,
    undetermined: false,
    exec: done ? (p.error ? "ERROR" : "SUCCESS") : null,
    result: done && !p.error ? p.result : null,
    message: done ? p.error || JSON.stringify(p.result) : "",
  };
}

export async function balanceOf(address: string): Promise<bigint> {
  await delay(40);
  return balance(address);
}

export async function faucet(address: string): Promise<bigint> {
  await delay(600);
  credit(address, 10n * GEN);
  return balance(address);
}

/**
 * The books, for the tests: what every account holds, and what the contract holds (every desk's
 * pot and stakes, and every bond credit). No call of the contract makes or loses an atto, so their
 * sum moves only when the faucet pays.
 */
export async function mockBook(): Promise<{ wallets: bigint; held: bigint; pots: bigint; staked: bigint; bonds: bigint }> {
  await ready();
  let wallets = 0n;
  for (const v of balances.values()) wallets += v;
  let pots = 0n;
  let staked = 0n;
  for (const d of desks.values()) {
    pots += d.pot;
    staked += d.staked;
  }
  let bonds = 0n;
  for (const v of bondCredit.values()) bonds += v;
  return { wallets, held: pots + staked + totals.bond, pots, staked, bonds };
}
