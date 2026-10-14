// Every call and every view the site makes, checked against the contract the site serves
// (public/contracts/recused.py, a byte copy of contracts/recused.py), with no network:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/contract-interface.test.mjs
//
// The method names, the number and order of the arguments, which writes take value, the limits,
// and the client-side door checks that tell a visitor before signing what the contract would refuse.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHALLENGE_BOND_ATTO,
  LIMITS,
  PAYABLE_FNS,
  STAKE_ATTO,
  WRITE_FNS,
  approveOutcome,
  calls,
  challengeOutcome,
  mapChallenge,
  mapDesk,
  mapMember,
  mapSpend,
  memberNo,
  movesMoney,
  pageProblem,
  phaseOf,
  publicNameProblem,
  registriesProblem,
  releaseOutcome,
  urlProblem,
  versionOfRule,
} from "../../lib/contract.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "..", "public", "contracts", "recused.py"), "utf8");
const chainSource = readFileSync(join(here, "..", "..", "lib", "chain.ts"), "utf8");

/** Every public method of the contract: its kind, and its parameters after self, in order. */
const methods = (() => {
  const out = new Map();
  const re = /@gl\.public\.(write\.payable|write|view)\s+def (\w+)\(self([^)]*)\)/g;
  for (const m of source.matchAll(re)) {
    const params = m[3]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(":")[0].trim());
    out.set(m[2], { kind: m[1], params });
  }
  return out;
})();
const constant = (name) => {
  const m = new RegExp("^" + name + " = (\\d+)\\b", "m").exec(source);
  assert.ok(m, "the contract no longer defines " + name + " as a number");
  return Number(m[1]);
};

const D = "D3";
const A = "0x" + "1".repeat(40);
const SAMPLE = {
  openDesk: calls.openDesk("Pelican Street fund", [], 10n ** 18n, 5, ["https://raw.githubusercontent.com/o/r/abc/registry/"], 10n ** 17n, 30),
  fund: calls.fund(D, 1n),
  enrol: calls.enrol(D, "I keep the minutes and run no business of my own.", [{ name: "Residents Association", relation: "member_of", detail: "" }], [], "Ines Corrie", 10n ** 17n),
  restake: calls.restake(D, 5n),
  retire: calls.retire(D),
  withdrawStake: calls.withdrawStake(D),
  amend: calls.amend(D, "I keep the minutes and run no business of my own.", [{ name: "Residents Association", relation: "member_of", detail: "" }], []),
  postSpend: calls.postSpend(D, A, 7n, "Refreshments for the street open day", 5, 60),
  identify: calls.identify(D, 2, "The payee is Gull Catering Ltd."),
  approve: calls.approve(D, 2),
  expire: calls.expire(D, 2),
  reclaim: calls.reclaim(D),
  release: calls.release(D, 2),
  deposit: calls.deposit(5n * 10n ** 16n),
  withdraw: calls.withdraw(),
  challenge: calls.challenge(D, 2, "M2", "https://raw.githubusercontent.com/o/r/abc/registry/gull-catering-ltd.html"),
};

test("every write the site builds is a write of the contract, with its arguments in the contract's number", () => {
  const built = Object.values(SAMPLE);
  assert.deepEqual(new Set(built.map((c) => c.fn)), new Set(WRITE_FNS), "one builder per write");
  for (const c of built) {
    const m = methods.get(c.fn);
    assert.ok(m, c.fn + " is not a method of the contract");
    assert.notEqual(m.kind, "view", c.fn + " is a view");
    assert.equal(c.args.length, m.params.length, `${c.fn}(${m.params.join(", ")}) takes ${m.params.length} arguments`);
  }
  const writes = [...methods].filter(([, m]) => m.kind !== "view").map(([n]) => n);
  assert.deepEqual(new Set(writes), new Set(WRITE_FNS), "the site knows every write the contract has");
});

test("exactly the payable writes carry value, and the rest never do", () => {
  const payable = [...methods].filter(([, m]) => m.kind === "write.payable").map(([n]) => n);
  assert.deepEqual(new Set(payable), new Set(PAYABLE_FNS));
  for (const c of Object.values(SAMPLE)) {
    if (PAYABLE_FNS.includes(c.fn)) assert.equal(typeof c.value, "bigint", c.fn + " sends value");
    else assert.ok(!c.value, c.fn + " must not send value");
  }
});

test("the arguments land where the contract reads them", () => {
  const o = SAMPLE.openDesk.args;
  assert.deepEqual(methods.get("open_desk").params, ["label", "roster_csv", "min_notice_minutes", "registries_json", "member_stake", "hold_minutes"]);
  assert.equal(typeof o[2], "number");
  assert.deepEqual(JSON.parse(o[3]), ["https://raw.githubusercontent.com/o/r/abc/registry/"]);
  assert.equal(o[4], "100000000000000000", "the stake is atto as a decimal string, never a float");
  assert.equal(o[5], 30);
  assert.deepEqual(methods.get("enrol").params, ["desk", "statement", "entries_json", "addresses_csv", "public_name"]);
  assert.equal(SAMPLE.enrol.args[4], "Ines Corrie");
  assert.equal(SAMPLE.enrol.value, 10n ** 17n);
  assert.deepEqual(methods.get("challenge").params, ["desk", "spend", "member_no", "url"]);
  assert.deepEqual(SAMPLE.challenge.args, [D, "2", "M2", "https://raw.githubusercontent.com/o/r/abc/registry/gull-catering-ltd.html"]);
  assert.equal(memberNo(3), "M3");
  assert.equal(memberNo("m4"), "M4");
  assert.deepEqual(SAMPLE.release.args, [D, "2"]);
  assert.deepEqual(SAMPLE.deposit.args, []);
});

test("every view the site reads exists, and is called with the contract's number of arguments", () => {
  // Arguments are counted at the top level of the list: a call inside an argument has commas of its own.
  const count = (list) => {
    if (!list.trim()) return 0;
    let depth = 0;
    let n = 1;
    for (const ch of list) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) n++;
    }
    return n;
  };
  const used = [...chainSource.matchAll(/viewAt\("(\w+)", \[([^\]]*)\]/g)].map((m) => [m[1], count(m[2])]);
  assert.ok(used.length >= 18);
  for (const [name, count] of used) {
    const m = methods.get(name);
    assert.ok(m && m.kind === "view", name + " is not a view of the contract");
    assert.equal(count, m.params.length, `${name} takes ${m.params.length} arguments`);
  }
  for (const v of ["challenges_of", "bond_credit_of", "stats"]) assert.ok(used.some(([n]) => n === v), "the site reads " + v);
});

test("the limits written into the site are the contract's own", () => {
  assert.deepEqual(LIMITS.roster, [constant("MIN_MEMBERS_TO_POST"), constant("MAX_ROSTER")]);
  assert.equal(LIMITS.membersPerDesk, constant("MAX_MEMBERS"));
  assert.deepEqual(LIMITS.holdMinutes, [constant("MIN_HOLD_MINUTES"), constant("MAX_HOLD_MINUTES")]);
  assert.equal(LIMITS.registries[1], constant("MAX_REGISTRIES"));
  assert.equal(LIMITS.registryChars, constant("MAX_REGISTRY"));
  assert.equal(LIMITS.registriesJsonChars, constant("MAX_REGISTRIES_JSON"));
  assert.equal(LIMITS.urlChars, constant("MAX_URL"));
  assert.deepEqual(LIMITS.publicName, [constant("MIN_PUBLIC_NAME"), constant("MAX_PUBLIC_NAME")]);
  assert.equal(LIMITS.challengesPage, constant("CHALLENGES_PAGE"));
  assert.deepEqual(LIMITS.noticeMinutes, [constant("MIN_NOTICE_MINUTES"), constant("MAX_NOTICE_MINUTES")]);
  const GEN = 10n ** 18n;
  assert.equal(STAKE_ATTO[0], GEN / 10n);
  assert.equal(STAKE_ATTO[1], 100n * GEN);
  assert.match(source, /^MIN_STAKE = GEN_ATTO \/\/ 10\b/m);
  assert.match(source, /^MAX_STAKE = 100 \* GEN_ATTO\b/m);
  assert.equal(CHALLENGE_BOND_ATTO, GEN / 20n);
  assert.match(source, /^CHALLENGE_BOND = GEN_ATTO \/\/ 20\b/m);
});

test("the address checks refuse before signing exactly what challenge() and open_desk() refuse", () => {
  const good = [
    "https://raw.githubusercontent.com/hossein6191/recused/0123456789abcdef0123456789abcdef01234567/registry/gull-catering-ltd.html",
    "https://registry.example/companies/ec-04417.html",
    "https://a.b/c~d_e-f.g",
  ];
  const bad = [
    ["http://registry.example/a", /starts with https/],
    ["https://Registry.example/a", /lowercase host/],
    ["https://registry.example", /lowercase host/],
    ["https://localhost/a", /lowercase host/],
    ["https://registry.example/a?b=1", /only letters, digits/],
    ["https://registry.example:443/a", /only letters, digits/],
    ["https://user@registry.example/a", /only letters, digits/],
    ["https://registry.example/a#top", /only letters, digits/],
    ["https://registry.example//a", /empty/],
    ["https://registry.example/./a", /segment/],
    ["https://registry.example/a/../b", /segment/],
    ["https://registry.example/café", /only letters, digits/],
    ["https://registry.example/" + "a".repeat(200), /at most 200/],
  ];
  for (const u of good) assert.equal(urlProblem(u, LIMITS.urlChars, "The page address"), "", u);
  for (const [u, why] of bad) assert.match(urlProblem(u, LIMITS.urlChars, "The page address"), why, u);

  const prefix = "https://registry.example/companies/";
  assert.equal(registriesProblem([prefix]).problem, "");
  assert.equal(registriesProblem([prefix]).json, JSON.stringify([prefix]));
  assert.match(registriesProblem([]).problem, /1 to 3/);
  assert.match(registriesProblem([prefix, "https://b.example/x/", "https://c.example/x/", "https://d.example/x/"]).problem, /1 to 3/);
  assert.match(registriesProblem(["https://registry.example/companies"]).problem, /ends with \//);
  assert.match(registriesProblem([prefix, prefix]).problem, /same prefix twice/);
  assert.match(registriesProblem(["https://registry.example/" + "a".repeat(120) + "/"]).problem, /at most 120/);

  assert.equal(pageProblem(prefix + "gull.html", [prefix]), "");
  assert.match(pageProblem(prefix, [prefix]), /not below one of the registers/, "the prefix itself is not a page");
  assert.match(pageProblem("https://elsewhere.example/companies/gull.html", [prefix]), /not below one of the registers/);
  // The contract says the same things.
  for (const words of [
    "names a lowercase host such as registry.example, then a path",
    "uses only letters, digits and - . _ ~ / after ",
    "a register prefix ends with /, so it names a whole directory of pages",
    "the registers name the same prefix twice",
    "the page is not below one of the registers",
  ])
    assert.ok(source.includes(words), "the contract no longer says: " + words);
});

test("a public name is what enrol() takes: 3 to 60 printable characters with at least one letter", () => {
  assert.equal(publicNameProblem("Mara Quist"), "");
  assert.match(publicNameProblem("MQ"), /3 to 60/);
  assert.match(publicNameProblem("123 456"), /holds letters/);
  assert.match(publicNameProblem('Mara "Q"'), /double quote/);
  assert.match(publicNameProblem("M" + "a".repeat(60)), /3 to 60/);
  assert.ok(source.includes("the public name is the name a public register would list you under, so it holds letters"));
});

test("what each version 2 call returns is read the way the contract writes it", () => {
  const status = (result, extra = {}) => ({ status: "FINALIZED", votes: { agree: 4, disagree: 0, idle: 1 }, applied: true, undetermined: false, exec: "SUCCESS", result, message: "", ...extra });
  const held = approveOutcome(status({ ok: true, counted: "2 of 2", state: "holding", held_at: 100, hold_until: 1900, paid: "0", value: "UU", verdict: "clear", member: A }));
  assert.equal(held.kind, "holding");
  assert.equal(held.holdUntil, 1900);
  assert.equal(approveOutcome(status({ ok: true, counted: "1 of 2", value: "UU", verdict: "clear", member: A })).kind, "counted");
  assert.equal(approveOutcome(status({ ok: false, attempt_spent: false, reason: "[EXPECTED] this member retired from countersigning on D3" })).kind, "procedural");

  const paid = releaseOutcome(status({ ok: true, state: "paid", paid: "7", to: A, pot: "3" }));
  assert.deepEqual([paid.kind, paid.paidAtto, paid.to], ["paid", "7", A]);
  assert.equal(releaseOutcome(status({ ok: false, dropped: [A], state: "open", approvals: 1, reason: "a counted signature on S2 was struck" })).kind, "dropped");
  assert.equal(releaseOutcome(status(null, { exec: "ERROR", message: "[EXPECTED] S2 is open; only a spend in its hold is released" })).kind, "refused");

  const challenger = "0x" + "2".repeat(40);
  const row = {
    n: 2, desk: D, spend: "S2", member: "M2", member_addr: A, public_name: "Mara Quist", challenger, url: "https://a.b/c", verdict: "hidden",
    read_as: "hidden", fp: "0123456789abcdef", repeat_of: 0, hold: 1, at: 5, bond: "50000000000000000", bond_to: challenger,
    slashed: "1000000000000000000", bounty: "500000000000000000", to_desk: "500000000000000000", state_after: "open",
  };
  const settled = challengeOutcome(status({ ok: true, ...row, approvals: 1, pot: "9", bond_credit: "50000000000000000" }));
  assert.equal(settled.kind, "settled");
  assert.deepEqual([settled.challenge.verdict, settled.challenge.bountyAtto, settled.challenge.stateAfter], ["hidden", "500000000000000000", "open"]);
  assert.equal(challengeOutcome(status(null, { exec: "ERROR", message: "[EXPECTED] a member may not challenge their own countersignature" })).kind, "refused");
  assert.equal(challengeOutcome({ ...status(null), undetermined: true, applied: false }).kind, "unsettled", "a page nobody agreed on stores nothing");
  assert.equal(movesMoney(status({ ok: true, ...row })), true, "a bounty moves money");
  assert.equal(movesMoney(status({ ok: true, ...row, verdict: "unclear", bounty: "0", slashed: "0" })), false);
  assert.equal(mapChallenge({ ...row, verdict: "nonsense" }).verdict, "unclear", "an unknown word is never read as a finding");

  const desk = mapDesk({ desk: D, registries: ["https://a.b/"], member_stake: "100", hold_minutes: 30, staked: "300", holding: 1 }, D, 1);
  assert.deepEqual([desk.version, desk.registries, desk.memberStakeAtto, desk.holdMinutes, desk.holding], [2, ["https://a.b/"], "100", 30, 1]);
  assert.equal(mapDesk({ desk: D }, D, 1).version, 1, "a version 1 register reads as version 1");
  const m = mapMember({ member: "M2", public_name: "Mara Quist", stake: "0", stake_whole: false, holds_open: 0, signed_open: 1, hidden: 1, cleared: 1, retired: false }, D);
  assert.deepEqual([m.publicName, m.stakeWhole, m.hidden, m.cleared, m.signedOpen], ["Mara Quist", false, 1, 1, 1]);
  const sp = mapSpend({ spend: "S2", state: "holding", hold_until: 200, held_at: 100, holds: 1, struck: 0, challenges: 3 }, D, 1);
  assert.deepEqual([sp.state, sp.holdUntil, sp.challenges], ["holding", 200, 3]);
  assert.equal(phaseOf(sp, 150), "holding");
  assert.equal(phaseOf(sp, 200), "releasable", "the hold ends at hold_until, as release() measures it");
  assert.equal(versionOfRule({ register: {} }), 2);
  assert.equal(versionOfRule({ limits: {} }), 1);
});
