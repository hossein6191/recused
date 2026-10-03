// A stand-in for the contract, in memory, for NEXT_PUBLIC_MOCK=1. lib/chain.ts delegates here.
//
// It follows contracts/recused.py rule for rule on everything deterministic (the door checks,
// the sequence counter, the two windows, the model-free refusals, the money path, the refusal
// ring) and answers every view in the contract's own JSON shape, so the mappers in lib/chain.ts
// run on the same rows in both modes. The one thing it cannot do is ask a model: a reading here
// is SCRIPTED (see scriptedValue below) and the demo banner says so on every page.
//
// The demo content is a tenants' association fund: one desk, five members, four spends that
// between them show a paid spend, a recusal by declared address, a recusal by reading, a late
// disclosure, an expiry, and a spend still in its notice window. State lives for as long as the
// tab does; a reload starts it again.

import type { TxStatus, WriteFn } from "./chain";
import { notify } from "./browser-store";

const GEN = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";
export const MOCK_REGISTER = "0x00000000000000000000000000000000000d3a10";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// The demo clock can be moved forward (the practice desk's "skip the wait"), never back.
let clockSkew = 0;
const clockNow = () => Math.floor(Date.now() / 1000) + clockSkew;
/** Moves the demo clock forward by so many seconds. */
export function skipClock(seconds: number): void {
  clockSkew += Math.max(0, Math.trunc(seconds));
  notify();
}

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

/** The accounts a visitor can act as in mock mode. The first is a newcomer with no disclosure. */
export const PERSONAS: Persona[] = [
  { address: VISITOR, name: "A new neighbour", note: "starts with no disclosure" },
  { address: PRINTER, name: "The print shop co-owner", note: "member M1" },
  { address: BIKE_CHAIR, name: "The bike group chair", note: "member M2" },
  { address: TEACHER, name: "The teacher", note: "member M3" },
  { address: NURSE, name: "The night nurse", note: "member M4" },
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
    "This member was already read on an earlier spend to this same payee address, no spend to that address has been paid since, and that reading was not clear, so it stands and the countersignature is refused with no model asked at all.",
};

const L = {
  MIN_STATEMENT: 24, MAX_STATEMENT: 600, MIN_ENTRIES: 1, MAX_ENTRIES: 6, MIN_ENTRY_NAME: 3, MAX_ENTRY_NAME: 80,
  MAX_ENTRY_DETAIL: 160, MIN_OTHER_DETAIL: 12, MAX_DECLARED: 6, MIN_DESCRIPTION: 16, MAX_DESCRIPTION: 400,
  MIN_IDENT: 8, MAX_IDENT: 200, MAX_IDENTS: 4, MIN_LABEL: 4, MAX_LABEL: 60, MAX_ROSTER: 24, MAX_MEMBERS: 24,
  MIN_MEMBERS_TO_POST: 3, MAX_OPEN_SPENDS: 8, MAX_OPEN_PER_POSTER: 2, MIN_NOTICE_MINUTES: 5, MAX_NOTICE_MINUTES: 1440, MIN_LIVE_MINUTES: 10,
  MAX_WINDOW_MINUTES: 20160, REFUSALS_KEPT: 12,
};

/** A raised refusal: nothing changes and the receipt carries the sentence. */
class Refused extends Error {}
const fail = (message: string): never => {
  throw new Refused("[EXPECTED] " + message);
};

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
    items = JSON.parse(String(raw));
  } catch {
    return fail("the entries are a JSON list of objects, each with a name, a relation and a detail");
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
  let place = 0;
  for (const part of String(raw).trim().split(",")) {
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
};
type Member = {
  who: string; desk: string; number: number; statement: string; entries: Entry[]; declared: string[];
  filedSeq: number; filedAt: number; version: number; digest: string; openPosted: number;
};
type Spend = {
  desk: string; number: number; poster: string; payee: string; amount: bigint; description: string; digest: string;
  docDigest: string; postedSeq: number; gateSeq: number; run: number; postedAt: number; noticeUntil: number;
  windowUntil: number; state: string; approvals: number; approver1: string; approver2: string; nIdents: number;
  shutOut: number; nAttempts: number; posterTried: number; claimed: bigint; paidAt: number; expiredAt: number;
  posterDeclared: boolean;
};
type Ident = { n: number; by: string; member: number; text: string; at: number; seq: number; digest: string; from: string };
/** The spends posted to one payee address since the last one that was paid. */
type Run = { run: number; live: boolean; gate: number; first: number; idents: (Omit<Ident, "n" | "from"> & { on: number })[] };
type Row = Record<string, unknown>;

const desks = new Map<string, Desk>();
let deskCount = 0;
const members = new Map<string, Member>(); // "D1:<address>"
const memberAt = new Map<string, string>(); // "D1:M3" -> "D1:<address>"
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
let openRefusals = 0;
let seqCount = 0;

const nextSeq = () => ++seqCount;
// What the contract prints in place of an id or a number that does not have the shape it gives one.
const deskWord = (raw: unknown) => (/^D[1-9]\d{0,9}$/.test(String(raw).trim()) ? String(raw).trim() : "(not a desk id)");
const addressWord = (raw: unknown) => (/^0x[0-9a-f]{40}$/.test(String(raw).trim().toLowerCase()) ? String(raw).trim().toLowerCase() : "(not an address)");
const spendWord = (raw: unknown) => (whole(raw) >= 0n ? "S" + whole(raw) : "(not a number)");

const deskOf = (id: string): Desk => desks.get(id) ?? fail("no desk " + deskWord(id));
function spendOf(deskId: string, spend: unknown): Spend {
  const n = whole(spend);
  return spends.get(`${deskId}:S${n}`) ?? fail(`no spend ${spendWord(spend)} on ${deskId}`);
}
const creditKey = (d: Desk, who: string) => `${d.id}:${d.fundRound}:${who}`;
const runOf = (key: string): Run => runs.get(key) ?? { run: 0, live: false, gate: 0, first: 0, idents: [] };
const standingKey = (s: Spend, who: string) => `${s.desk}:${s.payee}:${s.run}:${who}`;

/** What ends with a spend, paid or expired: its place among the open ones, and its poster's count. */
function leaveOpen(d: Desk, s: Spend): void {
  d.open = d.open.filter((n) => n !== s.number);
  d.nOpen -= 1;
  const poster = members.get(`${d.id}:${s.poster}`);
  if (poster && poster.openPosted > 0) poster.openPosted -= 1;
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

// ---- the methods that write ----------------------------------------------------------

type Ctx = { sender: string; value: bigint; now: number };

async function openDesk(c: Ctx, label: string, rosterCsv: string, minNoticeMinutes: unknown): Promise<Row> {
  label = String(label).trim();
  const floor = Number(whole(minNoticeMinutes));
  let problem = "";
  let roster: string[] = [];
  try {
    roster = parseAddresses(rosterCsv, L.MAX_ROSTER, "roster address");
  } catch (e) {
    problem = "the roster: " + (e as Error).message.replace("[EXPECTED] ", "");
  }
  if (!problem && roster.length && roster.length < L.MIN_MEMBERS_TO_POST)
    problem = `a roster names at least ${L.MIN_MEMBERS_TO_POST} addresses, because a spend needs its poster and two other members; leave the roster empty for open enrolment`;
  if (!problem) problem = textProblem(label, L.MIN_LABEL, L.MAX_LABEL, "the desk's name");
  if (!problem && !(floor >= L.MIN_NOTICE_MINUTES && floor <= L.MAX_NOTICE_MINUTES))
    problem = `the desk's minimum notice is ${L.MIN_NOTICE_MINUTES} to ${L.MAX_NOTICE_MINUTES} minutes; it is fixed here and no spend on this desk may give its members less time to say who a payee is`;
  if (problem) return refusePayable(c.sender, c.value, "", problem, c.now);
  const id = "D" + ++deskCount;
  const seq = nextSeq();
  desks.set(id, {
    id, opener: c.sender, label, roster, pot: c.value, committed: 0n, drawn: 0n, fundedTotal: c.value, claimsOpen: 0n,
    claimsDue: 0n, open: [], nMembers: 0, nSpends: 0, nOpen: 0, nPaid: 0, nExpired: 0, nReadings: 0, nRefusals: 0,
    openedAt: c.now, openedSeq: seq, fundRound: 1, minNotice: floor,
  });
  if (c.value > 0n) funded.set(`${id}:1:${c.sender}`, c.value);
  return {
    ok: true, desk: id, label, opener: c.sender, roster, open_enrolment: !roster.length, pot: c.value.toString(), seq,
    min_notice_minutes: floor,
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

async function enrol(c: Ctx, deskId: string, statement: string, entriesJson: string, addressesCsv: string): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const key = `${deskId}:${c.sender}`;
  if (members.has(key)) fail(`this address already has a disclosure on ${deskId}; amend it rather than enrolling twice`);
  if (d.roster.length && !d.roster.includes(c.sender))
    fail(`${deskId} was opened with a roster of ${d.roster.length} addresses and this one is not on it; the roster was fixed when the desk was opened and nobody can change it`);
  if (!d.roster.length && d.nMembers >= L.MAX_MEMBERS)
    fail(`${deskId} holds the most members a desk takes (${L.MAX_MEMBERS}); open a desk of your own, which needs nobody's permission`);
  statement = String(statement).trim();
  const entries = parseEntries(entriesJson);
  const addresses = parseAddresses(addressesCsv, L.MAX_DECLARED, "declared address");
  const problem = textProblem(statement, L.MIN_STATEMENT, L.MAX_STATEMENT, "the statement");
  if (problem) fail(problem);
  const seq = nextSeq();
  const number = ++d.nMembers;
  const digest = await disclosureDigest(statement, entries, addresses);
  members.set(key, { who: c.sender, desk: deskId, number, statement, entries, declared: addresses, filedSeq: seq, filedAt: c.now, version: 1, digest, openPosted: 0 });
  memberAt.set(`${deskId}:M${number}`, key);
  return { ok: true, desk: deskId, member: "M" + number, who: c.sender, filed_seq: seq, version: 1, entries: entries.length, declared: addresses, digest };
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
  if (other && spends.get(`${deskId}:${other}`)?.state === "open")
    fail(`the same payee, the same amount and the same words are already open on ${deskId} as ${other}; once it is carried or expired the same payment may be posted again`);
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
    posterTried: 0, claimed: 0n, paidAt: 0, expiredAt: 0, posterDeclared,
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

function finalReading(c: Ctx, d: Desk, s: Spend, member: Member, value: string, verdict: string, docDigest: string, identsSeen: number): Row {
  const label = "S" + s.number;
  const attempt = ++s.nAttempts;
  d.nReadings += 1;
  const row: Row = {
    desk: d.id, spend: label, member: c.sender, number: "M" + member.number, attempt, value, ifdone: value[0], ifnot: value[1],
    verdict, why: why(value, verdict), doc_digest: docDigest, idents_seen: identsSeen, filed_seq: member.filedSeq,
    posted_seq: s.postedSeq, gate_seq: s.gateSeq, run: s.run, version: member.version, at: c.now, model_asked: value !== "--",
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
  s.approvals += 1;
  if (s.approvals === 1) {
    s.approver1 = c.sender;
    return { ok: true, counted: "1 of 2", attempt_spent: true, approvals: 1, pot: d.pot.toString(), paid: "0", ...row };
  }
  s.approver2 = c.sender;
  s.state = "paid";
  s.paidAt = c.now;
  d.pot -= s.amount;
  d.committed -= s.amount;
  d.drawn += s.amount;
  d.nPaid += 1;
  // A funder who left while this spend was open bears their part of it: their claim on it is void.
  d.claimsOpen -= s.claimed;
  leaveOpen(d, s);
  // The payment ends the run of this payee address: the next spend to it is a new question.
  const run = runs.get(`${d.id}:${s.payee}`);
  if (run && run.live && run.run === s.run) run.live = false;
  credit(s.payee, s.amount);
  return {
    ok: true, counted: "2 of 2", attempt_spent: true, approvals: 2, state: "paid", paid: s.amount.toString(), to: s.payee,
    pot: d.pot.toString(), committed: d.committed.toString(), ...row,
  };
}

async function approve(c: Ctx, deskId: string, spend: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const me = c.sender;
  const d = desks.get(deskId);
  if (!d) return refuse("", me, "no desk " + deskWord(deskId), {}, c.now);
  const s = spends.get(`${deskId}:S${whole(spend)}`);
  if (!s) return refuse(deskId, me, `no spend ${spendWord(spend)} on ${deskId}`, {}, c.now);
  const label = "S" + s.number;
  const extra = { spend: label };
  const member = members.get(`${deskId}:${me}`);
  if (!member) return refuse(deskId, me, `only a member of ${deskId} may countersign a spend on it`, extra, c.now);
  if (me === s.poster) {
    // Counted on the spend itself, where no ring can turn it out of sight.
    s.posterTried += 1;
    return refuse(deskId, me, `the member who posted ${label} may never countersign it`, extra, c.now);
  }
  if (s.state !== "open") return refuse(deskId, me, `${label} is ${s.state} and takes no countersignatures`, extra, c.now);
  if (c.now >= s.windowUntil)
    return refuse(deskId, me, `the window of ${label} closed at ${s.windowUntil}; anybody may now call expire(${deskId}, ${s.number})`, extra, c.now);
  if (c.now < s.noticeUntil)
    return refuse(deskId, me, `the notice window of ${label} runs to ${s.noticeUntil}; until then any member but the poster whose disclosure predates the spend may identify the payee, and nobody may countersign`, extra, c.now);
  if ((readings.get(`${deskId}:${label}`) ?? []).some((r) => r.member === me))
    return refuse(deskId, me, `this address already has a reading on ${label}; one attempt per member per spend, and a verdict is final`, extra, c.now);
  if (s.payee === me || member.declared.includes(s.payee)) return finalReading(c, d, s, member, "--", "declared", "", 0);
  if (member.filedSeq > s.gateSeq) return finalReading(c, d, s, member, "--", "late", "", 0);
  if (standing.has(standingKey(s, me))) return finalReading(c, d, s, member, "--", "standing", "", 0);
  if (s.approvals >= 2) return refuse(deskId, me, `${label} already carries two counted countersignatures`, extra, c.now);
  const doc = spendDocument(s);
  const docDigest = await sha256(doc);
  if (!s.docDigest) s.docDigest = docDigest;
  const value = scriptedValue(doc, member);
  return finalReading(c, d, s, member, value, verdictFor(value), docDigest, s.nIdents);
}

async function expire(c: Ctx, deskId: string, spend: unknown): Promise<Row> {
  deskId = String(deskId).trim();
  const d = deskOf(deskId);
  const s = spendOf(deskId, spend);
  if (s.state !== "open") fail(`S${s.number} is already ${s.state}`);
  if (c.now < s.windowUntil) fail(`the window of S${s.number} runs to ${s.windowUntil}, another ${s.windowUntil - c.now} seconds`);
  s.state = "expired";
  s.expiredAt = c.now;
  d.committed -= s.amount;
  d.nExpired += 1;
  // What funders who left had claimed on this spend is theirs again: money owed, kept out of the free balance.
  d.claimsOpen -= s.claimed;
  d.claimsDue += s.claimed;
  leaveOpen(d, s);
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
  const waiting = mine.filter((x) => x.state === "open").map((x) => x.n);
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

async function run(fn: WriteFn, args: (string | number)[], c: Ctx): Promise<Row> {
  const a = args.map((x) => String(x));
  switch (fn) {
    case "open_desk": return openDesk(c, a[0], a[1] ?? "", a[2] ?? "");
    case "fund": return fund(c, a[0]);
    case "enrol": return enrol(c, a[0], a[1], a[2], a[3] ?? "");
    case "amend": return amend(c, a[0], a[1], a[2], a[3] ?? "");
    case "post_spend": return postSpend(c, a[0], a[1], a[2], a[3], a[4], a[5]);
    case "identify": return identify(c, a[0], a[1], a[2]);
    case "approve": return approve(c, a[0], a[1]);
    case "expire": return expire(c, a[0], a[1]);
    case "reclaim": return reclaim(c, a[0]);
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

  await openDesk(at(TEACHER, t0 - 9 * DAY, 400n * GEN), "Larch Court Tenants' Association", "", 5);
  await enrol(
    at(PRINTER, t0 - 9 * DAY + 20 * MIN), D,
    "I co-own Pelican Press, the print shop on Quay Street, with my sister. We print flyers, posters and newsletters for local groups, and the shop is most of my income.",
    JSON.stringify([
      { name: "Pelican Press", relation: "part_owns", detail: "a print shop on Quay Street; I hold half of it" },
      { name: "Quay Street Traders' Circle", relation: "member_of", detail: "the shop pays a yearly subscription" },
    ]),
    PRINT_SHOP_TILL,
  );
  await enrol(
    at(BIKE_CHAIR, t0 - 9 * DAY + 45 * MIN), D,
    "I chair the Larch Court Bike Group, an unpaid role. The group runs a repair evening in the basement once a month and applies to this fund for tools and parts. I have no paid work connected to the building.",
    JSON.stringify([
      { name: "Larch Court Bike Group", relation: "officer_of", detail: "I chair it and sign its funding requests" },
      { name: "Riverside Cycle Co-op", relation: "buys_from", detail: "where the group buys parts at a member discount" },
    ]),
    "",
  );
  await enrol(
    at(TEACHER, t0 - 9 * DAY + 70 * MIN), D,
    "I teach mathematics at Alder Lane Primary School and have lived in the building for six years. I own no business and sit on no committee outside this association.",
    JSON.stringify([{ name: "Alder Lane Primary School", relation: "employed_by", detail: "full-time class teacher" }]),
    "",
  );
  await enrol(
    at(NURSE, t0 - 9 * DAY + 3 * HOUR), D,
    "I work nights as a nurse at St Brendan's Hospital. I rent my flat like everyone else here and I have no stake in any supplier the association uses.",
    JSON.stringify([
      { name: "St Brendan's Hospital", relation: "employed_by", detail: "" },
      { name: "Larch Court Housing Co-operative", relation: "tenant_of", detail: "flat 9, the same landlord as every member" },
    ]),
    "",
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

  // S2: the print job. The payee is an address the print shop co-owner declared, so that
  // member is refused with no model asked; two other members read clear and the fund pays.
  await postSpend(
    at(BIKE_CHAIR, t0 - 3 * DAY), D, PRINT_SHOP_TILL, 85n * GEN,
    "Printing 400 copies of the spring newsletter and 60 posters for the annual general meeting, quoted at 85 GEN including paper.",
    120, 4320,
  );
  await identify(at(TEACHER, t0 - 3 * DAY + 30 * MIN), D, 2, "The payee is Pelican Press, the print shop on Quay Street that member M1 co-owns.");
  await approve(at(PRINTER, t0 - 3 * DAY + 3 * HOUR), D, 2);
  await approve(at(TEACHER, t0 - 3 * DAY + 5 * HOUR), D, 2);
  await approve(at(NURSE, t0 - 2 * DAY), D, 2);

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
    at(TRANSLATOR, t0 - 15 * HOUR), D,
    "I moved into flat 14 in August and work from home as a translator. I do no business with the association or with anyone who supplies it.",
    JSON.stringify([{ name: "Harrow and Finch Translations", relation: "owns", detail: "my own one-person translation practice" }]),
    "",
  );
  await approve(at(BIKE_CHAIR, t0 - 12 * HOUR), D, 3);
  await approve(at(TRANSLATOR, t0 - 10 * HOUR), D, 3);
  await approve(at(TEACHER, t0 - 6 * HOUR), D, 3);
  // The poster tried too, and the refusal ring remembers it.
  await approve(at(NURSE, t0 - 5 * HOUR), D, 3);

  // S4: posted two minutes ago, still in its notice window, and nobody has said who the payee is.
  await postSpend(
    at(TEACHER, t0 - 2 * MIN), D, LOCKSMITH, 38n * GEN,
    "Replacement lock and three keys for the bike shed door after the break-in on the ground floor.",
    6, 90,
  );

  // A second, smaller desk with a fixed roster, so the desk list shows both kinds.
  await openDesk(at(NURSE, t0 - 4 * DAY, 75n * GEN), "Stairwell B Garden Box", [NURSE, TEACHER, TRANSLATOR].join(","), 60);
  await enrol(
    at(NURSE, t0 - 4 * DAY + 10 * MIN), "D2",
    "I work nights as a nurse at St Brendan's Hospital and look after the planters outside stairwell B at weekends.",
    JSON.stringify([{ name: "St Brendan's Hospital", relation: "employed_by", detail: "" }]),
    "",
  );
}

// ---- views, in the contract's JSON shapes -------------------------------------------

const spendRow = (s: Spend): Row => ({
  spend: "S" + s.number, payee: s.payee, amount: s.amount.toString(), state: s.state, approvals: s.approvals,
  n_idents: s.nIdents, n_attempts: s.nAttempts, poster: s.poster, run: s.run, gate_seq: s.gateSeq,
  notice_until: s.noticeUntil, window_until: s.windowUntil,
});

const storedValue = (deskId: string, n: number, who: string): string =>
  String((readings.get(`${deskId}:S${n}`) ?? []).find((r) => r.member === who)?.value ?? "");

export async function view(fn: string, args: (string | number)[]): Promise<unknown> {
  await ready();
  await delay(90);
  const a = args.map((x) => String(x).trim());
  const now = clockNow();
  const deskId = a[0] ?? "";
  const d = desks.get(deskId);
  const noDesk = { error: "no desk " + deskWord(deskId) };
  const s = spends.get(`${deskId}:S${whole(a[1] ?? "")}`);
  const noSpend = { error: `no spend ${spendWord(a[1] ?? "")} on ${deskWord(deskId)}` };
  switch (fn) {
    case "desks":
    case "desks_from": {
      const start = fn === "desks" ? Math.max(1, deskCount - 23) : Math.max(1, Number(whole(a[0] ?? "")));
      const rows = [...desks.values()].slice(start - 1, start + 23).map((x) => ({
        desk: x.id, label: x.label, pot: x.pot.toString(), members: x.nMembers, open_spends: x.nOpen, open_enrolment: !x.roster.length,
        min_notice_minutes: x.minNotice,
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
        open: d.open.map((n) => "S" + n), paid: d.nPaid,
        expired: d.nExpired, readings: d.nReadings, refusals: d.nRefusals, opened_at: d.openedAt, opened_seq: d.openedSeq,
        fund_round: d.fundRound, min_notice_minutes: d.minNotice, seq_now: seqCount, now,
      });
    case "member": {
      const m = members.get(`${deskId}:${(a[1] ?? "").toLowerCase()}`);
      if (!m) return JSON.stringify({ error: `no disclosure from ${addressWord(a[1] ?? "")} on ${deskWord(deskId)}` });
      return JSON.stringify({
        desk: deskId, member: "M" + m.number, who: m.who, statement: m.statement,
        entries: m.entries.map((e) => ({ ...e, relation_phrase: RELATION_PHRASE[e.relation] })), declared: m.declared,
        n_entries: m.entries.length, n_declared: m.declared.length, filed_seq: m.filedSeq, filed_at: m.filedAt,
        version: m.version, digest: m.digest, open_spends_posted: m.openPosted,
      });
    }
    case "members": {
      if (!d) return JSON.stringify(noDesk);
      const rows = [];
      for (let n = 1; n <= Math.min(d.nMembers, 24); n++) {
        const m = members.get(memberAt.get(`${deskId}:M${n}`) ?? "");
        if (m)
          rows.push({
            member: "M" + n, who: m.who, filed_seq: m.filedSeq, version: m.version, n_entries: m.entries.length,
            n_declared: m.declared.length, digest: m.digest, open_spends_posted: m.openPosted,
          });
      }
      return JSON.stringify({ desk: deskId, count: d.nMembers, rows });
    }
    case "spend":
      if (!s) return JSON.stringify(noSpend);
      return JSON.stringify({
        desk: deskId, ...spendRow(s), poster: s.poster, description: s.description, digest: s.digest, doc_digest: s.docDigest,
        posted_seq: s.postedSeq, posted_at: s.postedAt, approver1: s.approver1, approver2: s.approver2,
        approver1_value: storedValue(deskId, s.number, s.approver1), approver2_value: storedValue(deskId, s.number, s.approver2),
        shut_out: s.shutOut, poster_tried: s.posterTried, claimed: s.claimed.toString(),
        poster_declared: s.posterDeclared, paid_at: s.paidAt, expired_at: s.expiredAt, now,
      });
    case "spends": {
      if (!d) return JSON.stringify(noDesk);
      const first = Math.max(1, d.nSpends - 23);
      const rows = [];
      for (let n = first; n <= d.nSpends; n++) {
        const x = spends.get(`${deskId}:S${n}`);
        if (x) rows.push(spendRow(x));
      }
      return JSON.stringify({ desk: deskId, count: d.nSpends, first, rows, now });
    }
    case "reading": {
      const r = (readings.get(`${deskId}:S${whole(a[1] ?? "")}`) ?? []).find((x) => x.member === (a[2] ?? "").toLowerCase());
      return JSON.stringify(r ? { ok: true, ...r } : { ok: false, reason: "no reading from that address on that spend" });
    }
    case "readings":
      if (!s) return JSON.stringify(noSpend);
      return JSON.stringify({
        desk: deskId, spend: "S" + s.number, count: s.nAttempts, poster_tried: s.posterTried, rows: readings.get(`${deskId}:S${s.number}`) ?? [],
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
        },
        relations: RELATION_PHRASE,
      });
    default:
      throw new Error("the mock has no view " + fn);
  }
}

// ---- transactions ----------------------------------------------------------------------

const pending = new Map<string, { fn: string; polls: number; result: Row; error: string }>();
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
  try {
    result = await run(fn, args, { sender, value, now: clockNow() });
  } catch (e) {
    if (!(e instanceof Refused)) throw e;
    // A raised refusal changes nothing, returns what was sent, and leaves its sentence in the receipt.
    if (value > 0n) credit(sender, value);
    error = e.message;
  }
  const hash = fakeHash();
  pending.set(hash, { fn, polls: 0, result, error });
  return hash;
}

export async function deploy(): Promise<string> {
  await delay(250);
  const hash = fakeHash();
  pending.set(hash, { fn: "deploy", polls: 0, result: {}, error: "" });
  return hash;
}

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"];
const NO_VOTES = { agree: 0, disagree: 0, idle: 0 };

export async function txStatus(hash: string): Promise<TxStatus> {
  await delay(60);
  const p = pending.get(hash);
  if (!p) return { status: "UNKNOWN", votes: NO_VOTES, applied: null, undetermined: false, exec: null, result: null, message: "" };
  p.polls += 1;
  // As on Studio, the result can be read from ACCEPTED on, one stage before FINALIZED.
  const done = p.polls >= STAGES.length - 1;
  // Studio assigns five validators and one is often idle in a round; the mock shows the same shape.
  const agree = p.fn === "approve" ? Math.min(p.polls, 4) : done ? 4 : 0;
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
