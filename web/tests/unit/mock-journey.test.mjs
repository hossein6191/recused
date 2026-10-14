// Demo mode's stand-in for the contract (lib/chain-mock.ts), walked through version 2 from node with
// no network, through the same call builders (lib/contract.ts) the pages use:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/mock-journey.test.mjs
//
// One journey through every new path (stakes, the hold, a clean, a hidden, an unclear and a
// repeated challenge, a page that cannot be read, the release, restaking, retiring and every route
// out), with the money counted after every step; then seeded random journeys through every write,
// checking after each step that no atto is made or lost and that the books agree with each other.
// Every refusal met is checked against the words of the contract the site serves.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as mock from "../../lib/chain-mock.ts";
import {
  CHALLENGE_BOND_ATTO,
  approveOutcome,
  calls,
  challengeOutcome,
  mapChallengePage,
  mapDesk,
  mapMember,
  mapSpend,
  phaseOf,
  releaseOutcome,
} from "../../lib/contract.ts";
import { registryPrefixAt } from "../../lib/registry.ts";

// The contract's sentences, with the string literals Python joins across lines joined here too.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "contracts", "recused.py"), "utf8").replace(/"\s*\n\s*"/g, "");
const GEN = 10n ** 18n;
const REGISTER = registryPrefixAt("main");
const PAGE = (file) => REGISTER + file;
/** A distinct lowercase address for each number. */
const addr = (n) => "0x" + n.toString(16).padStart(40, "a");

/** Sends one call as `who` and waits for it to finish, as the pages do. */
async function send(who, call) {
  const hash = await mock.write(call.fn, call.args, call.value ?? 0n, who);
  for (;;) {
    const s = await mock.txStatus(hash);
    if (s.status === "FINALIZED" || s.undetermined) return s;
  }
}
const view = async (fn, args = []) => JSON.parse(await mock.view(fn, args));
const total = async () => {
  const b = await mock.mockBook();
  return b.wallets + b.held;
};
const reasonOf = (s) => String(s.result?.reason ?? s.message ?? "");

/** A refusal is the contract's own: these words appear in recused.py as written. */
function contractSays(s, words) {
  const text = reasonOf(s);
  assert.ok(text.includes(words), `the refusal "${text.slice(0, 120)}" does not say "${words}"`);
  assert.ok(source.includes(words), `recused.py does not say "${words}"`);
}

test("one journey through version 2: stakes, the hold, clean, hidden, unclear, a repeat, an unreadable page, the release and every route out", async () => {
  const [A, B, C, D, S, P] = [0xa11, 0xb22, 0xc33, 0xd44, 0x5e5, 0x9f9].map(addr);
  for (const who of [A, A, A, B, C, D, S]) await mock.faucet(who);
  let books = await total();
  const step = async (who, call) => {
    const s = await send(who, call);
    assert.equal(await total(), books, `${call.fn} made or lost money`);
    return s;
  };
  const before = async (who) => mock.balanceOf(who);

  // The desk: a hold under the floor is refused and the value comes back in the same transaction.
  let s = await step(A, calls.openDesk("Pelican Street fund", [], 3n * GEN, 5, [REGISTER], GEN / 2n, 4));
  assert.equal(s.result.ok, false);
  assert.equal(s.result.returned, String(3n * GEN));
  contractSays(s, "minutes: how long a spend carried by two clear readings waits, open to challenge, before it pays");
  s = await step(A, calls.openDesk("Pelican Street fund", [], 20n * GEN, 5, [REGISTER], GEN / 2n, 45));
  assert.equal(s.result.ok, true);
  const desk = s.result.desk;
  assert.deepEqual(s.result.registries, [REGISTER]);

  // Enrolment stakes exactly the desk's stake; a wrong amount is refused and returned.
  const statement = {
    A: ["I keep the minutes of the Pelican Street Residents Association and run no business of my own.", "Pelican Street Residents Association", "member_of", "Ines Corrie"],
    B: ["I co-own Pelican Press, a two-person print shop on the same street, with my sister.", "Pelican Press", "part_owns", "Mara Quist"],
    C: ["I chair the tenants' bike group, a club with its own small kitty that buys and sells nothing.", "Pelican Street tenants' bike group", "officer_of", "Tomas Brandt"],
    D: ["I teach at the local school and have no business interests of any kind.", "Hillside Primary School", "employed_by", "Elin Varga"],
  };
  const enrol = (k, stake) => calls.enrol(desk, statement[k][0], [{ name: statement[k][1], relation: statement[k][2], detail: "" }], [], statement[k][3], stake);
  const a0 = await before(A);
  s = await step(A, enrol("A", (GEN * 2n) / 5n));
  assert.equal(s.result.ok, false);
  contractSays(s, "the member stake fixed when the desk was opened");
  assert.equal(await before(A), a0, "the 0.4 GEN came back");
  for (const [k, who] of [["A", A], ["B", B], ["C", C], ["D", D]]) {
    s = await step(who, enrol(k, GEN / 2n));
    assert.equal(s.result.ok, true, k + ": " + reasonOf(s));
  }
  const number = Object.fromEntries((await view("members", [desk])).rows.map((r) => [r.who, r.member]));
  assert.equal(mapDesk(await view("desk", [desk]), desk, 1).stakedAtto, String(2n * GEN));

  // The spend, and bond credit put up early.
  s = await step(A, calls.postSpend(desk, P, 6n * GEN, "Refreshments for the street open day from Gull Catering Ltd", 5, 180));
  const n = Number(String(s.result.spend).slice(1));
  s = await step(S, calls.deposit(GEN / 5n));
  assert.equal(s.result.bond_credit, String(GEN / 5n));

  // Two clear readings put the spend in its hold, and pay nothing.
  mock.skipClock(5 * 60 + 5);
  const p0 = await before(P);
  assert.equal(approveOutcome(await step(B, calls.approve(desk, n))).kind, "counted");
  const held = approveOutcome(await step(C, calls.approve(desk, n)));
  assert.equal(held.kind, "holding");
  assert.equal(await before(P), p0, "nothing reached the payee");
  let sp = mapSpend(await view("spend", [desk, String(n)]), desk, 1);
  assert.equal(phaseOf(sp, sp.chainNow), "holding");
  assert.equal(sp.holdUntil - held.reading.at, 45 * 60);

  // Refused before anything is fetched.
  s = await step(S, calls.release(desk, n));
  assert.equal(releaseOutcome(s).kind, "refused");
  contractSays(s, "until then anyone may cite a page of one of the desk's registers against either counted signature");
  s = await step(S, calls.challenge(desk, n, number[B], "https://raw.githubusercontent.com/hossein6191/recused/main/README.md"));
  contractSays(s, "named when it was opened (");
  s = await step(B, calls.challenge(desk, n, number[B], PAGE("gull-catering-ltd.html")));
  contractSays(s, "a member may not challenge their own countersignature");
  s = await step(S, calls.challenge(desk, n, number[D], PAGE("gull-catering-ltd.html")));
  contractSays(s, "only a counted signature can be struck");
  s = await step(D, calls.challenge(desk, n, number[B], PAGE("gull-catering-ltd.html")));
  contractSays(s, "from bond credit, and this address holds ");
  assert.match(reasonOf(s), /this address holds 0;/);

  // A page that names Mara only for the print shop she filed: clean, and the bond goes to her.
  const b0 = await before(B);
  s = await step(S, calls.challenge(desk, n, number[B], PAGE("pelican-press-ltd.html")));
  let o = challengeOutcome(s);
  assert.equal(o.kind, "settled");
  assert.equal(o.challenge.verdict, "clean");
  assert.equal(o.challenge.bondTo, B);
  assert.equal((await before(B)) - b0, CHALLENGE_BOND_ATTO);
  assert.equal(o.bondCreditAtto, String(GEN / 5n - CHALLENGE_BOND_ATTO));

  // The Gull Catering page: hidden. Struck, slashed, half paid to S in that transaction, the spend open again.
  const s0 = await before(S);
  const pot0 = BigInt(mapDesk(await view("desk", [desk]), desk, 1).potAtto);
  s = await step(S, calls.challenge(desk, n, number[B], PAGE("gull-catering-ltd.html")));
  o = challengeOutcome(s);
  assert.equal(o.challenge.verdict, "hidden");
  assert.equal(o.challenge.slashedAtto, String(GEN / 2n));
  assert.equal((await before(S)) - s0, GEN / 4n, "the bounty reached the challenger");
  assert.equal(BigInt(mapDesk(await view("desk", [desk]), desk, 1).potAtto) - pot0, GEN / 4n, "the other half went into the pot");
  assert.equal(o.challenge.stateAfter, "open");
  assert.equal(o.approvals, 1);
  sp = mapSpend(await view("spend", [desk, String(n)]), desk, 1);
  assert.deepEqual([sp.state, sp.approvals, sp.struck, sp.approver1], ["open", 1, 1, C]);
  const readings = (await view("readings", [desk, String(n)])).rows;
  assert.equal(readings.find((r) => r.member === B).struck, true, "the reading is kept, struck");
  const mara = mapMember(await view("member", [desk, B]), desk);
  assert.deepEqual([mara.stakeAtto, mara.stakeWhole, mara.hidden, mara.cleared], ["0", false, 1, 1]);
  s = await step(S, calls.challenge(desk, n, number[B], PAGE("gull-catering-ltd.html")));
  contractSays(s, "a register page is read only against a spend in its hold");

  // Another member reads clear and the spend holds again.
  assert.equal(approveOutcome(await step(D, calls.approve(desk, n))).kind, "holding");
  // A page that cannot be read stores nothing and takes no bond.
  const count0 = (await view("challenges_of", [desk, String(n), "0", "20"])).count;
  s = await step(S, calls.challenge(desk, n, number[C], PAGE("no-such-page.html")));
  assert.equal(challengeOutcome(s).kind, "unsettled");
  assert.equal((await view("challenges_of", [desk, String(n), "0", "20"])).count, count0);
  // A page that never names Tomas: unclear, nothing moves.
  const c0 = await before(C);
  s = await step(S, calls.challenge(desk, n, number[C], PAGE("gull-catering-ltd.html")));
  assert.equal(challengeOutcome(s).challenge.verdict, "unclear");
  assert.equal(await before(C), c0);
  s = await step(S, calls.challenge(desk, n, number[C], PAGE("gull-catering-ltd.html")));
  contractSays(s, "each page is read once against each signature");
  const page = mapChallengePage(await view("challenges_of", [desk, String(n), "0", "20"]), desk, 1);
  assert.deepEqual(page.rows.map((r) => r.verdict), ["clean", "hidden", "unclear"]);
  assert.ok(page.rows.every((r) => /^[0-9a-f]{16}$/.test(r.fp)));
  assert.equal(page.rows[2].hold, 2);

  // After the hold, anyone releases it, and the payee is paid in that transaction.
  sp = mapSpend(await view("spend", [desk, String(n)]), desk, 1);
  mock.skipClock(sp.holdUntil - sp.chainNow + 2);
  const rel = releaseOutcome(await step(S, calls.release(desk, n)));
  assert.deepEqual([rel.kind, rel.paidAtto, rel.to], ["paid", String(6n * GEN), P]);
  assert.equal((await before(P)) - p0, 6n * GEN);

  // Every route out: restake, retire and take the stake back, take the bond credit back.
  s = await step(B, calls.restake(desk, GEN / 4n));
  contractSays(s, "and it is returned");
  s = await step(B, calls.restake(desk, GEN / 2n));
  assert.equal(s.result.whole, true);
  s = await step(A, calls.withdrawStake(desk));
  contractSays(s, "call retire first");
  await step(A, calls.retire(desk));
  s = await step(A, calls.approve(desk, n));
  assert.equal(approveOutcome(s).kind, "procedural");
  const aBack = await before(A);
  s = await step(A, calls.withdrawStake(desk));
  assert.equal(s.result.withdrawn, String(GEN / 2n));
  assert.equal((await before(A)) - aBack, GEN / 2n);
  s = await step(S, calls.withdraw());
  assert.equal(s.result.withdrawn, String(GEN / 5n - CHALLENGE_BOND_ATTO));
  s = await step(S, calls.withdraw());
  contractSays(s, "this address holds no bond credit");
  books = await total();
});

// ---- seeded random journeys ----------------------------------------------------------------------

/** A small seeded generator, so a failing journey can be run again exactly. */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = 10;
const STEPS = 120;
const PAGES = ["gull-catering-ltd.html", "pelican-press-ltd.html", "heron-signs-ltd.html", "osprey-paper-ltd-former-officers.html", "missing.html"];
const NAMES = ["Mara Quist", "Tomas Brandt", "Elin Varga", "Ines Corrie", "Owen Sallis", "Petra Lund"];
const COMPANIES = ["Pelican Press", "Gull Catering", "Heron Signs", "Osprey Paper", "Marsh Lane Allotments", "Hillside Primary School"];
const DESCRIPTIONS = [
  "Refreshments for the street open day from Gull Catering Ltd",
  "Print the minutes book at Pelican Press Ltd",
  "Paint a new sign for the community hall door",
  "Paper and card for the spring newsletter",
];

test(`no atto is made or lost: ${SEEDS} seeded journeys of ${STEPS} random steps, the books checked after every step`, async () => {
  const met = new Set();
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = rng(seed * 7919);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const actors = Array.from({ length: 6 }, (_, i) => addr(0x100000 * seed + 0x1000 + i));
    const payees = [...actors.slice(0, 2), addr(0x100000 * seed + 0x2000), addr(0x100000 * seed + 0x2001)];
    for (const a of actors) await mock.faucet(a);
    const stake = pick([GEN / 10n, GEN / 2n, GEN]);
    let s = await send(actors[0], calls.openDesk(`Random desk ${seed}`, [], 5n * GEN, 5, [REGISTER], stake, pick([5, 30, 120])));
    assert.equal(s.result.ok, true);
    const desk = s.result.desk;
    // A start that reaches the hold, so the random steps meet challenges and releases as well as refusals.
    const warm = [
      ["I co-own Pelican Press, a two-person print shop on the same street, with my sister.", "Pelican Press", "Mara Quist"],
      ["I teach at the local school and have no business interests of any kind.", "Hillside Primary School", "Elin Varga"],
      ["I chair the tenants' bike group, a club with its own small kitty.", "Pelican Street bike group", "Tomas Brandt"],
      ["I keep the minutes of the residents association and run no business.", "Residents Association", "Ines Corrie"],
    ];
    for (let j = 0; j < warm.length; j++)
      await send(actors[j], calls.enrol(desk, warm[j][0], [{ name: warm[j][1], relation: "member_of", detail: "" }], [], warm[j][2], stake));
    s = await send(actors[3], calls.postSpend(desk, payees[2], GEN / 2n, DESCRIPTIONS[0], 5, 240));
    mock.skipClock(5 * 60 + 5);
    await send(actors[0], calls.approve(desk, Number(String(s.result.spend).slice(1))));
    await send(actors[1], calls.approve(desk, Number(String(s.result.spend).slice(1))));
    // A whistleblower who never enrols, with bond credit for several challenges.
    await send(actors[5], calls.deposit(5n * CHALLENGE_BOND_ATTO));
    let books = await total();
    const done = new Set();
    /** A member a register page just struck: their route back in is to restake. */
    let struck = "";

    for (let i = 0; i < STEPS; i++) {
      let who = pick(actors);
      const d = await view("desk", [desk]);
      const nSpends = d.spends;
      const spendN = nSpends ? 1 + Math.floor(r() * nSpends) : 1;
      const memberN = d.members ? "M" + (1 + Math.floor(r() * d.members)) : "M1";
      let k = Math.floor(r() * 18) % 16;
      if (struck && r() < 0.5) {
        who = struck;
        struck = "";
        k = 13;
      }
      let call;
      if (k === 0) call = calls.fund(desk, BigInt(1 + Math.floor(r() * 3)) * (GEN / 10n));
      else if (k === 1) {
        const c = pick(COMPANIES);
        call = calls.enrol(desk, `I am tied to ${c} and to nothing else on this street.`, [{ name: c, relation: pick(["owns", "employed_by", "member_of"]), detail: "" }], [], pick(NAMES), r() < 0.85 ? stake : stake / 2n);
      } else if (k === 2) call = calls.postSpend(desk, pick(payees), BigInt(1 + Math.floor(r() * 5)) * (GEN / 10n), pick(DESCRIPTIONS), 5, pick([15, 60, 240]));
      else if (k <= 4) call = calls.approve(desk, spendN);
      else if (k === 5) {
        mock.skipClock(Math.floor(r() * 3000));
        continue;
      } else if (k === 6) call = calls.release(desk, spendN);
      else if (k === 7) call = calls.expire(desk, spendN);
      else if (k === 8) call = calls.reclaim(desk);
      else if (k === 9) call = calls.deposit(BigInt(1 + Math.floor(r() * 3)) * CHALLENGE_BOND_ATTO);
      else if (k <= 11) {
        // Half the time a counted signature of a spend in its hold, and most often a page that names Mara Quist.
        const sp = await view("spend", [desk, String(spendN)]);
        const counted = [sp.approver1, sp.approver2].filter((a) => a && !/^0x0+$/.test(a));
        const rows = (await view("members", [desk])).rows;
        const target = r() < 0.5 && counted.length ? rows.find((m) => m.who === pick(counted))?.member ?? memberN : memberN;
        if (r() < 0.5) who = actors[5];
        const roll = r();
        call = calls.challenge(desk, spendN, target, PAGE(roll < 0.3 ? PAGES[0] : roll < 0.6 ? PAGES[1] : pick(PAGES)));
      }
      else if (k === 12) call = calls.withdraw();
      else if (k === 13) {
        // Usually a member whose stake was slashed tops it up; sometimes anybody tries.
        const short = (await view("members", [desk])).rows.find((m) => !m.retired && BigInt(m.stake) < stake);
        if (short && who !== short.who && r() < 0.5) who = short.who;
        call = calls.restake(desk, stake - BigInt((await view("member", [desk, who])).stake ?? "0"));
      }
      else if (k === 14) call = r() < 0.15 ? calls.retire(desk) : calls.withdrawStake(desk);
      else call = calls.amend(desk, `I am tied to ${pick(COMPANIES)} and to my own small workshop.`, [{ name: pick(COMPANIES), relation: "owns", detail: "" }], []);
      if (call.value !== undefined && call.value > (await mock.balanceOf(who))) continue;
      s = await send(who, call);
      done.add(call.fn + ":" + (s.result?.ok === true ? "ok" : s.undetermined ? "unsettled" : "refused"));
      if (call.fn === "challenge" && s.result?.ok === true) {
        done.add("finding:" + s.result.verdict);
        if (s.result.verdict === "hidden") struck = String(s.result.member_addr);
      }

      // The books: nothing made or lost, and every figure agrees with the others.
      const now = await total();
      assert.equal(now, books, `seed ${seed}, step ${i}: ${call.fn} by ${who} changed the money in the world`);
      const book = await mock.mockBook();
      const stats = await view("stats");
      assert.equal(BigInt(stats.bond_credit), book.bonds, `seed ${seed}, step ${i}: bond credit and its total disagree`);
      const dd = await view("desk", [desk]);
      const members = (await view("members", [desk])).rows;
      assert.equal(BigInt(dd.staked), members.reduce((t, m) => t + BigInt(m.stake), 0n), `seed ${seed}, step ${i}: the desk's stakes and its members' disagree`);
      assert.ok(BigInt(dd.pot) >= 0n && BigInt(dd.free) >= 0n, `seed ${seed}, step ${i}: a negative balance`);
      for (const m of members) assert.ok(BigInt(m.stake) <= stake, "no member holds more than the desk's stake");
      books = now;
    }
    assert.ok(done.size >= 8, `seed ${seed} met only ${[...done].join(", ")}`);
    for (const x of done) met.add(x);
  }
  // Between them the journeys reach every write, and every money path of version 2.
  for (const x of ["enrol:ok", "approve:ok", "release:ok", "deposit:ok", "challenge:ok", "challenge:refused", "withdraw:ok", "finding:hidden", "finding:clean", "finding:unclear", "restake:ok", "withdraw_stake:ok", "expire:ok", "reclaim:ok", "fund:ok", "post_spend:ok"])
    assert.ok(met.has(x), "no journey reached " + x + "; met " + [...met].sort().join(", "));
});
