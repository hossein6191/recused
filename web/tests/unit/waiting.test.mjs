// Every waiting moment of version 2, as every role sees it (lib/waiting.ts), from node:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/waiting.test.mjs
//
// The owner's rule for every site: each wait says what is happening and who it waits for, how
// long, whether anything is needed from you now, whether you can leave, and where the money is.
// Here every state is checked against every role for all five, and for the figures that matter.

import test from "node:test";
import assert from "node:assert/strict";

import { WAIT_KINDS, WAIT_ROLES, waitingCopy } from "../../lib/waiting.ts";

const GEN = 10n ** 18n;
const S = (n) => String(n);
const STATES = {
  holding: { kind: "holding", label: "S4", now: 1000, holdUntil: 1000 + 1800, amountAtto: S(2n * GEN / 5n), stakeAtto: S(GEN), bondAtto: S(GEN / 20n), challenges: 2 },
  releasable: { kind: "releasable", label: "S4", amountAtto: S(2n * GEN / 5n) },
  challenge: { kind: "challenge", label: "S4", publicName: "Mara Quist", page: "gull-catering-ltd.html", bondAtto: S(GEN / 20n), stakeAtto: S(GEN), amountAtto: S(2n * GEN / 5n) },
  struck: { kind: "struck", label: "S4", publicName: "Mara Quist", slashedAtto: S(GEN), bountyAtto: S(GEN / 2n), toDeskAtto: S(GEN / 2n), amountAtto: S(2n * GEN / 5n), expired: false },
  released: { kind: "released", label: "S4", amountAtto: S(2n * GEN / 5n) },
  restake: { kind: "restake", desk: "D2", publicName: "Mara Quist", missingAtto: S(GEN), holdsOpen: 0 },
  retired: { kind: "retired", desk: "D2", stakeAtto: S(GEN), signedOpen: 1, holdsOpen: 1 },
};

test("every new state of version 2 has its waiting copy", () => {
  assert.deepEqual(Object.keys(STATES).sort(), [...WAIT_KINDS].sort());
});

test("every state, for every role, answers the five questions in plain sentences", () => {
  for (const kind of WAIT_KINDS) {
    for (const role of WAIT_ROLES) {
      const lines = waitingCopy(STATES[kind], role);
      assert.deepEqual(Object.keys(lines).sort(), ["act", "howLong", "leave", "money", "what"], `${kind}/${role}`);
      for (const [key, text] of Object.entries(lines)) {
        const where = `${kind}/${role}/${key}`;
        assert.ok(text.length >= 12 && text.length <= 520, `${where} is ${text.length} characters`);
        assert.match(text, /[.!]$/, `${where} ends without a full stop: ${text}`);
        assert.doesNotMatch(text, /undefined|NaN|null|\[object/, where);
        assert.match(text, /^[A-Z0-9]/, `${where} starts with a capital`);
      }
    }
  }
});

test("the lines carry the figures a visitor needs: time left, amounts, and where each one is", () => {
  const holding = waitingCopy(STATES.holding, "signer");
  assert.match(holding.howLong, /30 min/);
  assert.match(holding.money, /1 GEN/, "the signer's stake");
  assert.match(holding.money, /0\.4 GEN/, "the committed amount");
  assert.match(holding.leave, /can leave/);
  assert.match(waitingCopy(STATES.holding, "challenger").act, /0\.05 GEN/, "the bond a challenge stakes");
  assert.match(waitingCopy({ ...STATES.holding, now: 0 }, "anyone").howLong, /chain's clock/, "no countdown on a guess");

  const flight = waitingCopy(STATES.challenge, "challenger");
  assert.match(flight.what, /gull-catering-ltd\.html/);
  assert.match(flight.howLong, /one to three minutes/);
  assert.match(flight.money, /still in your bond credit/);
  assert.match(flight.money, /half of their stake/);

  assert.match(waitingCopy(STATES.struck, "challenger").money, /0\.5 GEN of the slashed stake was paid to you/);
  assert.match(waitingCopy(STATES.struck, "signer").money, /whole stake of 1 GEN was slashed/);
  assert.match(waitingCopy(STATES.struck, "signer").act, /restake/);
  assert.match(waitingCopy(STATES.struck, "anyone").what, /open again/);
  assert.match(waitingCopy({ ...STATES.struck, expired: true }, "anyone").what, /expired/);

  assert.match(waitingCopy(STATES.releasable, "anyone").act, /Release/);
  assert.match(waitingCopy(STATES.released, "funder").money, /left the pot/);
  assert.match(waitingCopy(STATES.restake, "signer").act, /restake exactly 1 GEN/);
  assert.match(waitingCopy(STATES.retired, "signer").howLong, /once each spend they signed/);
  assert.match(waitingCopy({ ...STATES.retired, signedOpen: 0, holdsOpen: 0 }, "signer").act, /Withdraw stake/);
});
