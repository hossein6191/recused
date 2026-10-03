// The practice desk's script and order (lib/practice.ts), run from node with no network:
//
//   node --test tests/unit/practice.test.mjs
//
// What is pinned here is what the page promises a visitor: the spend is never posted before
// their own disclosure is on chain, nothing waits on a window by guessing the time, the member
// the second spend pays is never its poster, a step with a transaction in flight is never sent
// again, and every text the page-held members file fits the limits the contract enforces
// (read from the contract source the site serves, so a changed limit fails here first).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACTIONS,
  CAST,
  IDENTIFY_NEEDS_S,
  LIVE_MINUTES,
  MARK_WAIT_MS,
  NOTICE_MARGIN_S,
  ROLES,
  SIGNER,
  SPEND1,
  SPEND2,
  VISITOR_DISCLOSURE,
  blankAction,
  blankState,
  blocked,
  deskLabel,
  firstSpendBusy,
  identification,
  identifyTooLate,
  nextHeld,
  parseState,
  plan,
  reserveNeeded,
  rowPhase,
  startedState,
} from "../../lib/practice.ts";

const REGISTER = "0x8efdc4782f5484c7225ae30b9d1006f0614f2f6b";
const key = (n) => "0x" + String(n).repeat(64);
const address = (n) => "0x" + String(n).repeat(40);
const KEYS = { teacher: key(1), printer: key(2), nurse: key(3), locksmith: key(4), till: key(5) };
const ADDRESSES = { teacher: address(1), printer: address(2), nurse: address(3), locksmith: address(4), till: address(5) };
const NOW_MS = 1_790_000_000_000;
const T = 1_790_000_000; // chain seconds

const started = () => startedState(REGISTER, KEYS, ADDRESSES, NOW_MS);
const finish = (s, ...ids) => {
  for (const id of ids) s.actions[id] = { ...s.actions[id], phase: "done" };
  return s;
};
const reading = (verdict, value = verdict === "clear" ? "UU" : "GU") => ({ verdict, value });
const SETUP = ["fundTeacher", "fundPrinter", "fundNurse", "open", "enrolTeacher", "enrolPrinter", "enrolNurse"];
/** A desk with the three practice members on it and nothing else. */
const deskReady = () => {
  const s = finish(started(), ...SETUP);
  s.desk = "D7";
  return s;
};
/** The first spend posted after the visitor enrolled, its notice window ending at T. */
const spendPosted = () => {
  const s = finish(deskReady(), "enrolYou", "post1");
  s.visitor = address(9);
  s.members.you = { number: "M4", filedSeq: 5 };
  s.s1 = { n: 1, noticeUntil: T, windowUntil: T + 3600, postedSeq: 6 };
  return s;
};

test("nothing is sent before the visitor presses the button", () => {
  const s = blankState(REGISTER);
  assert.deepEqual(nextHeld(s, T, NOW_MS), []);
  for (const id of ACTIONS) assert.notEqual(blocked(s, id, T), "", id);
});

test("the setup runs in order: faucet, then the desk, then the three disclosures", () => {
  const s = started();
  assert.deepEqual(nextHeld(s, 0, NOW_MS), ["fundTeacher", "fundPrinter", "fundNurse"]);
  finish(s, "fundTeacher", "fundPrinter", "fundNurse");
  assert.deepEqual(nextHeld(s, 0, NOW_MS), ["open"]);
  finish(s, "open");
  assert.deepEqual(nextHeld(s, 0, NOW_MS), ["enrolTeacher", "enrolPrinter", "enrolNurse"]);
});

test("the spend is never posted before the visitor's own disclosure is on chain", () => {
  const s = deskReady();
  assert.deepEqual(nextHeld(s, T, NOW_MS), [], "with every practice member enrolled, the page still waits for the visitor");
  assert.match(blocked(s, "post1", T), /your own disclosure has to be on chain first/);
  for (const phase of ["checking", "signing", "onchain", "refused", "stopped", "waiting"]) {
    s.actions.enrolYou = { ...blankAction(), phase };
    assert.notEqual(blocked(s, "post1", T), "", "enrolYou " + phase);
  }
  finish(s, "enrolYou");
  assert.deepEqual(nextHeld(s, T, NOW_MS), ["post1"]);
});

test("once the spend exists nobody is offered a late enrolment", () => {
  const s = deskReady();
  assert.equal(blocked(s, "enrolYou", 0), "");
  s.actions.post1 = { ...blankAction(), hash: "0x" + "a".repeat(64) };
  assert.match(blocked(s, "enrolYou", 0), /already posted/);
  assert.match(blocked(spendPosted(), "enrolYou", 0), /already posted/);
});

test("a countersignature waits for the notice window on the chain's clock, and never on a guess", () => {
  const s = spendPosted();
  assert.match(blocked(s, "signYou", 0), /clock has not been read/);
  assert.match(blocked(s, "signYou", T - 1), /notice window is still running/);
  assert.match(blocked(s, "signYou", T), /notice window is still running/, "the margin keeps the call's own clock past the window");
  assert.equal(blocked(s, "signYou", T + NOTICE_MARGIN_S), "");
});

test("the print shop co-owner countersigns only after the visitor has been read", () => {
  const s = spendPosted();
  assert.match(blocked(s, "signPrinter", T + 60), /your own countersignature comes first/);
  assert.deepEqual(nextHeld(s, T + 60, NOW_MS), []);
  s.readings.you = reading("clear");
  finish(s, "signYou");
  assert.match(blocked(s, "signPrinter", 0), /clock has not been read/);
  assert.deepEqual(nextHeld(s, T + 60, NOW_MS), ["signPrinter"]);
});

test("the night nurse countersigns only when one of the two readings was not clear", () => {
  const both = spendPosted();
  both.readings = { you: reading("clear"), printer: reading("clear") };
  both.paid = { atto: "1", to: address(4), by: "printer", potAtto: "0" };
  finish(both, "signYou", "signPrinter");
  assert.equal(reserveNeeded(both), false);
  assert.deepEqual(nextHeld(both, T + 60, NOW_MS), []);

  const recused = spendPosted();
  recused.readings = { you: reading("interested"), printer: reading("clear") };
  finish(recused, "signYou", "signPrinter");
  assert.equal(reserveNeeded(recused), true);
  assert.deepEqual(nextHeld(recused, T + 60, NOW_MS), ["signNurse"]);

  const hesitant = spendPosted();
  hesitant.readings = { you: reading("clear"), printer: reading("unclear", "U?") };
  finish(hesitant, "signYou", "signPrinter");
  assert.deepEqual(nextHeld(hesitant, T + 60, NOW_MS), ["signNurse"]);
});

test("the contrast is one click, and the member it would pay never posts it", () => {
  const s = spendPosted();
  assert.match(blocked(s, "post2", T), /has not been asked for/);
  s.contrast = true;
  assert.deepEqual(nextHeld(s, T - 100, NOW_MS), ["post2"], "it may be started while the first notice window runs");
  assert.equal(SIGNER.post1, "teacher");
  assert.equal(SIGNER.post2, "teacher");
  assert.equal(SIGNER.sign2, "printer");
  assert.notEqual(SIGNER.post2, SIGNER.sign2);
  assert.equal(SPEND2.payee, "till");
  assert.match(SPEND2.description, /Pelican Press/);
  assert.equal(CAST.printer.entries.some((e) => e.name === "Pelican Press"), true);
  assert.equal(/print|pelican/i.test(SPEND1.description), false, "the first spend has nothing in it the print shop touches");

  finish(s, "post2");
  s.s2 = { n: 2, noticeUntil: T + 300, windowUntil: T + 3900, postedSeq: 8 };
  assert.deepEqual(nextHeld(s, T + 10, NOW_MS), ["identify2"]);
  assert.match(blocked(s, "sign2", T + 400), /identification is settled first/);
  finish(s, "identify2");
  assert.match(blocked(s, "sign2", T + 299), /notice window is still running/);
  assert.equal(blocked(s, "sign2", T + 300 + NOTICE_MARGIN_S), "");

  // The same member countersigns both spends: while the first is being carried, the contrast waits.
  const open = T + 300 + NOTICE_MARGIN_S;
  s.actions.signYou = { ...blankAction(), phase: "onchain", hash: "0x" + "e".repeat(64) };
  assert.equal(firstSpendBusy(s), true);
  assert.match(blocked(s, "sign2", open), /countersigns the first spend first/);
  finish(s, "signYou");
  s.readings.you = { verdict: "clear" };
  assert.match(blocked(s, "sign2", open), /countersigns the first spend first/, "read, and the second countersignature not landed yet");
  finish(s, "signPrinter");
  assert.equal(blocked(s, "sign2", open), "");
  s.actions.signPrinter = { ...blankAction(), phase: "stopped" };
  assert.equal(blocked(s, "sign2", open), "", "a first spend that stopped does not hold the contrast for ever");
  s.actions.signPrinter = blankAction();
  delete s.readings.you;
  s.actions.signYou = blankAction();
  assert.equal(blocked(s, "sign2", open), "", "a visitor who has not countersigned does not hold it either");

  assert.equal(identifyTooLate(s, T + 10), false);
  assert.equal(identifyTooLate(s, T + 290), true);
});

test("a step that stopped or was refused is not picked up again by itself, and a pause is honoured", () => {
  const s = started();
  s.actions.fundTeacher = { ...blankAction(), phase: "stopped" };
  s.actions.fundPrinter = { ...blankAction(), phase: "refused" };
  s.actions.fundNurse = { ...blankAction(), notBefore: NOW_MS + 5000 };
  assert.deepEqual(nextHeld(s, 0, NOW_MS), []);
  assert.deepEqual(nextHeld(s, 0, NOW_MS + 5000), ["fundNurse"]);
});

test("nothing is sent twice: a hash is followed, a fresh mark is waited on, and only then is the chain read to send", () => {
  assert.equal(plan({ ...blankAction(), hash: "0x" + "b".repeat(64), markedAt: NOW_MS }, NOW_MS + 10 * MARK_WAIT_MS), "follow");
  assert.equal(plan({ ...blankAction(), markedAt: NOW_MS }, NOW_MS + 1000), "wait");
  assert.equal(plan({ ...blankAction(), markedAt: NOW_MS }, NOW_MS + MARK_WAIT_MS), "read");
  assert.equal(plan(blankAction(), NOW_MS), "read");
});

test("the stored state survives a reload: outcomes are kept, anything in motion is looked at again with its hash", () => {
  const s = spendPosted();
  const hash = "0x" + "c".repeat(64);
  s.actions.signYou = { ...blankAction(), phase: "onchain", hash };
  s.actions.signPrinter = { ...blankAction(), phase: "signing", markedAt: NOW_MS };
  const back = parseState(JSON.stringify(s), REGISTER);
  assert.ok(back);
  assert.equal(back.desk, "D7");
  assert.deepEqual(back.s1, s.s1);
  assert.equal(back.visitor, address(9));
  assert.equal(back.actions.post1.phase, "done");
  assert.deepEqual([back.actions.signYou.phase, back.actions.signYou.hash], ["waiting", hash]);
  assert.deepEqual([back.actions.signPrinter.phase, back.actions.signPrinter.markedAt], ["waiting", NOW_MS]);
  assert.equal(plan(back.actions.signYou, NOW_MS), "follow");
  assert.equal(plan(back.actions.signPrinter, NOW_MS + 1000), "wait");
});

test("a stored state for another register, an old version, or junk is not used", () => {
  const raw = JSON.stringify(spendPosted());
  assert.equal(parseState(raw, "0x" + "f".repeat(40)), null);
  assert.equal(parseState(raw.replace('"v":1', '"v":0'), REGISTER), null);
  assert.equal(parseState("", REGISTER), null);
  assert.equal(parseState("{not json", REGISTER), null);
  assert.equal(parseState(JSON.stringify({ ...spendPosted(), keys: { teacher: "nope" } }), REGISTER), null);
  assert.equal(parseState(JSON.stringify(blankState(REGISTER)), REGISTER), null, "a desk that was never started is not a state to resume");
});

test("a row's state follows its calls, and a recusal reads as refused", () => {
  const s = spendPosted();
  assert.equal(rowPhase(s, "desk"), "done");
  assert.equal(rowPhase(s, "sign"), "waiting");
  s.actions.signYou = { ...blankAction(), phase: "onchain" };
  assert.equal(rowPhase(s, "sign"), "onchain");
  finish(s, "signYou");
  s.readings.you = reading("interested");
  assert.equal(rowPhase(s, "sign"), "recused");
  s.readings.you = reading("clear");
  assert.equal(rowPhase(s, "sign"), "done");
  s.readings.printer = reading("clear");
  finish(s, "signPrinter");
  s.paid = { atto: "1", to: address(4), by: "printer", potAtto: "0" };
  assert.equal(rowPhase(s, "pay"), "done", "the reserve is not waited for when two readings were clear");
  assert.equal(rowPhase(s, "contrast"), "waiting");
});

// ---- the texts the page-held members file, against the contract the site serves -----------------

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "contracts", "recused.py"), "utf8");
const limit = (name) => {
  const m = new RegExp("^" + name + " = (\\d+)", "m").exec(source);
  assert.ok(m, "the contract no longer defines " + name);
  return Number(m[1]);
};
const relations = /^RELATIONS = \(([^)]*)\)/ms.exec(source)?.[1] ?? "";
const fits = (text, least, most, what) => {
  assert.ok(text.length >= least && text.length <= most, `${what} is ${text.length} characters, outside ${least} to ${most}`);
  assert.equal(/^[\x20-\x7e]+$/.test(text), true, what + " is not printable ASCII on one line");
  assert.equal(/[<>"]/.test(text), false, what + " holds a character the contract refuses");
};

test("every text the practice desk files fits the limits written in the contract", () => {
  const disclosures = [...ROLES.map((r) => [CAST[r].name, CAST[r]]), ["the visitor's suggestion", VISITOR_DISCLOSURE]];
  for (const [who, d] of disclosures) {
    fits(d.statement, limit("MIN_STATEMENT"), limit("MAX_STATEMENT"), who + ": the statement");
    assert.ok(d.entries.length >= limit("MIN_ENTRIES") && d.entries.length <= limit("MAX_ENTRIES"), who + ": the number of entries");
    for (const e of d.entries) {
      fits(e.name, limit("MIN_ENTRY_NAME"), limit("MAX_ENTRY_NAME"), who + ": an entry name");
      if (e.detail) fits(e.detail, 1, limit("MAX_ENTRY_DETAIL"), who + ": an entry detail");
      assert.ok(relations.includes(`"${e.relation}"`), `${who}: the relation ${e.relation} is not in the contract's catalogue`);
    }
  }
  for (const sp of [SPEND1, SPEND2]) fits(sp.description, limit("MIN_DESCRIPTION"), limit("MAX_DESCRIPTION"), "a spend description");
  fits(identification("M2"), limit("MIN_IDENT"), limit("MAX_IDENT"), "the identification");
  fits(identification(""), limit("MIN_IDENT"), limit("MAX_IDENT"), "the identification");
  fits(deskLabel(address(1)), limit("MIN_LABEL"), limit("MAX_LABEL"), "the desk's name");
  assert.ok(SPEND1.amountAtto + SPEND2.amountAtto <= 10n ** 18n, "both spends fit inside the pot together");
});

test("the script stays inside the contract's caps: one poster, two open spends, and the shortest notice", () => {
  const posters = ["post1", "post2"].map((id) => SIGNER[id]);
  assert.deepEqual(posters, ["teacher", "teacher"]);
  assert.ok(limit("MAX_OPEN_PER_POSTER") >= 2, "the teacher has both practice spends open at once");
  assert.ok(limit("MIN_MEMBERS_TO_POST") <= ROLES.length + 1, "the practice desk has enough members to post");
  assert.ok(limit("MAX_IDENTS") >= 1);
  assert.ok(IDENTIFY_NEEDS_S < limit("MIN_NOTICE_MINUTES") * 60, "an identification fits inside the shortest notice window");
  assert.ok(LIVE_MINUTES >= limit("MIN_LIVE_MINUTES"), "countersignatures stay open at least as long as the contract asks");
});

test("the visitor's suggested disclosure names nothing the first spend touches", () => {
  const words = (VISITOR_DISCLOSURE.statement + " " + VISITOR_DISCLOSURE.entries.map((e) => e.name + " " + e.detail).join(" ")).toLowerCase();
  for (const w of ["lock", "key", "bike", "shed", "harrow"]) assert.equal(words.includes(w), false, w);
});
