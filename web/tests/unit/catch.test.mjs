// The "catch a hidden conflict" track's script and order (lib/catch.ts), from node with no network:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/catch.test.mjs
//
// What the page promises: nothing is sent before the visitor presses the button, the members
// enrol only with GEN for their stakes, the spend is posted only once all four are on the desk, the
// countersignatures wait for the notice window on the chain's clock, the visitor's own steps are
// never sent by the page, the tries come before the catch and stop once the hold ends, and a stored
// track resumes with every step in motion looked at again.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIONS,
  MARGIN_S,
  SIGNER,
  TRY_PAGE,
  blankState,
  blocked,
  countedSigners,
  holdOver,
  isVisitorAction,
  maraCounted,
  nextHeld,
  otherSigner,
  parseState,
  rowPhase,
  startedState,
  tryMember,
  tryTarget,
  tryUrl,
} from "../../lib/catch.ts";
import { blankAction } from "../../lib/track.ts";

const REGISTER = "0x8efdc4782f5484c7225ae30b9d1006f0614f2f6b";
const PREFIX = "https://raw.githubusercontent.com/hossein6191/recused/0123456789abcdef0123456789abcdef01234567/registry/";
const key = (n) => "0x" + String(n).repeat(64);
const address = (n) => "0x" + String(n).repeat(40);
const KEYS = { ines: key(1), mara: key(2), tomas: key(3), elin: key(4), gull: key(5) };
const ADDRESSES = { ines: address(1), mara: address(2), tomas: address(3), elin: address(4), gull: address(5) };
const NOW_MS = 1_790_000_000_000;
const T = 1_790_000_000;

const started = () => startedState(REGISTER, KEYS, ADDRESSES, NOW_MS, PREFIX);
const finish = (s, ...ids) => {
  for (const id of ids) s.actions[id] = { ...s.actions[id], phase: "done" };
  return s;
};
const reading = (verdict) => ({ verdict, value: verdict === "clear" ? "UU" : "GU" });
const SETUP = ["fundInes", "fundMara", "fundTomas", "fundElin", "open", "enrolInes", "enrolMara", "enrolTomas", "enrolElin"];
const posted = () => {
  const s = finish(started(), ...SETUP, "post");
  s.desk = "D9";
  s.members = { ines: { number: "M1", filedSeq: 2 }, mara: { number: "M2", filedSeq: 3 }, tomas: { number: "M3", filedSeq: 4 }, elin: { number: "M4", filedSeq: 5 } };
  s.spend = { n: 1, noticeUntil: T, windowUntil: T + 7200, postedSeq: 6 };
  return s;
};
/** Mara and Tomas read clear, and the spend is in its hold until T + 1800. */
const holding = () => {
  const s = finish(posted(), "signMara", "signTomas");
  s.readings = { mara: reading("clear"), tomas: reading("clear") };
  s.held = { until: T + 1800, at: T };
  return s;
};

test("nothing is sent before the visitor presses the button, and the visitor's own steps are never the page's", () => {
  const s = blankState(REGISTER);
  assert.deepEqual(nextHeld(s, T, NOW_MS), []);
  for (const id of ACTIONS) assert.notEqual(blocked(s, id, T), "", id);
  for (const id of ["deposit", "tryClean", "tryUnclear", "catchIt", "withdraw"]) assert.equal(isVisitorAction(id), true, id);
  for (const id of ACTIONS) if (!isVisitorAction(id)) assert.notEqual(SIGNER[id], "you");
});

test("the setup runs in order: faucet, the desk, the four members with their stakes, then the spend", () => {
  const s = started();
  assert.deepEqual(nextHeld(s, 0, NOW_MS), ["fundInes", "fundMara", "fundTomas", "fundElin"]);
  finish(s, "fundInes");
  s.actions.fundMara = { ...blankAction(), phase: "onchain" };
  assert.deepEqual(nextHeld(s, 0, NOW_MS).filter((id) => !id.startsWith("fund")), ["open"]);
  finish(s, "open");
  assert.match(blocked(s, "enrolMara", 0), /no test GEN for the stake/);
  assert.deepEqual(nextHeld(s, 0, NOW_MS).filter((id) => id.startsWith("enrol")), ["enrolInes"]);
  finish(s, "fundMara", "fundTomas", "fundElin", "enrolInes", "enrolMara", "enrolTomas");
  assert.match(blocked(s, "post", 0), /not all enrolled/, "the reserve enrols before the spend, or it could never be read on it");
  finish(s, "enrolElin");
  assert.deepEqual(nextHeld(s, 0, NOW_MS), ["post"]);
});

test("the countersignatures wait for the notice window on the chain's clock, Mara first", () => {
  const s = posted();
  assert.match(blocked(s, "signMara", 0), /clock has not been read/);
  assert.match(blocked(s, "signMara", T), /notice window is still running/);
  assert.deepEqual(nextHeld(s, T + MARGIN_S, NOW_MS), ["signMara"]);
  assert.match(blocked(s, "signTomas", T + 60), /Mara countersigns first/);
  s.readings.mara = reading("clear");
  finish(s, "signMara");
  assert.deepEqual(nextHeld(s, T + 60, NOW_MS), ["signTomas"]);
});

test("Elin countersigns only when one of the two readings was not clear", () => {
  const both = holding();
  assert.deepEqual(nextHeld(both, T + 60, NOW_MS), []);
  assert.deepEqual(countedSigners(both), ["mara", "tomas"]);
  assert.equal(maraCounted(both), true);
  assert.equal(otherSigner(both), "tomas");

  const tomasOut = finish(posted(), "signMara", "signTomas");
  tomasOut.readings = { mara: reading("clear"), tomas: reading("unclear") };
  assert.deepEqual(nextHeld(tomasOut, T + 60, NOW_MS), ["signElin"]);
  tomasOut.readings.elin = reading("clear");
  finish(tomasOut, "signElin");
  tomasOut.held = { until: T + 1800, at: T };
  assert.equal(otherSigner(tomasOut), "elin", "the unclear try then cites the page against Elin");

  const maraOut = finish(posted(), "signMara", "signTomas", "signElin");
  maraOut.readings = { mara: reading("unclear"), tomas: reading("clear"), elin: reading("clear") };
  maraOut.held = { until: T + 1800, at: T };
  assert.equal(maraCounted(maraOut), false);
  assert.match(blocked(maraOut, "catchIt", T + 60), /no signature of hers to strike/);
  assert.equal(rowPhase(maraOut, "signs"), "recused", "the page says plainly there is nothing to catch on this desk");
});

test("the bond comes first; the tries come before the catch; nothing is cited after the hold or after the strike", () => {
  const s = holding();
  assert.equal(blocked(s, "deposit", T + 60), "", "bond credit may be put up as soon as the spend exists");
  for (const id of ["tryClean", "tryUnclear", "catchIt"]) assert.match(blocked(s, id, T + 60), /bond credit first/, id);
  finish(s, "deposit");
  s.credit = String(10n ** 17n);
  for (const id of ["tryClean", "tryUnclear", "catchIt"]) assert.equal(blocked(s, id, T + 60), "", id);
  assert.deepEqual([tryTarget(s, "clean"), tryTarget(s, "unclear"), tryTarget(s, "catch")], ["mara", "tomas", "mara"]);
  assert.deepEqual([tryMember(s, "clean"), tryMember(s, "unclear"), tryMember(s, "catch")], ["M2", "M3", "M2"]);
  assert.equal(tryUrl(s, "catch"), PREFIX + TRY_PAGE.catch);
  assert.equal(TRY_PAGE.catch, "gull-catering-ltd.html");

  // The visitor's calls go one at a time.
  s.actions.tryClean = { ...blankAction(), phase: "onchain" };
  assert.match(blocked(s, "catchIt", T + 60), /still with the network/);
  assert.equal(blocked(s, "tryClean", T + 60), "", "a call is never blocked by itself");
  s.actions.tryClean = { ...blankAction(), phase: "done" };
  s.credit = String(10n ** 16n);
  assert.match(blocked(s, "catchIt", T + 60), /under the 0\.05 GEN/);
  s.credit = String(5n * 10n ** 16n);

  assert.match(blocked(s, "catchIt", T + 1800), /hold has ended/);
  assert.equal(holdOver(s, T + 1800), true);
  s.results.catch = { verdict: "hidden" };
  assert.match(blocked(s, "tryUnclear", T + 60), /struck/, "the strike ends the hold");
  assert.equal(holdOver(s, T + 60), true);
  assert.equal(blocked(s, "withdraw", T + 60), "", "the bond credit can always come back");
  s.credit = "0";
  assert.match(blocked(s, "withdraw", T + 60), /no bond credit/);
});

test("a stored track survives a reload: outcomes kept, anything in motion looked at again with its hash", () => {
  const s = holding();
  const hash = "0x" + "c".repeat(64);
  s.actions.catchIt = { ...blankAction(), phase: "onchain", hash };
  s.actions.deposit = { ...blankAction(), phase: "signing", markedAt: NOW_MS };
  s.credit = "100";
  s.balanceBefore = "200";
  const back = parseState(JSON.stringify(s), REGISTER);
  assert.ok(back);
  assert.equal(back.registry, PREFIX);
  assert.deepEqual(back.held, s.held);
  assert.deepEqual([back.actions.catchIt.phase, back.actions.catchIt.hash], ["waiting", hash]);
  assert.deepEqual([back.actions.deposit.phase, back.actions.deposit.markedAt], ["waiting", NOW_MS]);
  assert.deepEqual([back.credit, back.balanceBefore], ["100", "200"]);
  assert.equal(parseState(JSON.stringify(s), "0x" + "f".repeat(40)), null, "another register");
  assert.equal(parseState(JSON.stringify({ ...s, registry: "" }), REGISTER), null, "a desk with no register is not resumed");
  assert.equal(parseState(JSON.stringify({ ...s, v: 0 }), REGISTER), null);
  assert.equal(parseState("{", REGISTER), null);
});

test("the rows follow their calls", () => {
  const s = holding();
  assert.equal(rowPhase(s, "desk"), "done");
  assert.equal(rowPhase(s, "signs"), "done");
  assert.equal(rowPhase(s, "bond"), "waiting");
  finish(s, "deposit");
  assert.equal(rowPhase(s, "bond"), "done");
  s.actions.catchIt = { ...blankAction(), phase: "onchain" };
  assert.equal(rowPhase(s, "catch"), "onchain");
});
