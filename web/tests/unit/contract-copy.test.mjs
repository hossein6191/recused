// The contract the /deploy page serves must be the repository's contract, byte for byte:
//
//   node --test tests/unit/contract-copy.test.mjs
//
// A copy that drifted would let a visitor deploy something other than the code the repository
// shows, under a sha256 that matches nothing. `node tools/sync-contract.mjs` repairs it.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { SERVED, SOURCE, compare } from "../../tools/sync-contract.mjs";

test("public/contracts/recused.py exists and is a GenLayer contract", () => {
  assert.equal(existsSync(SERVED), true);
  const text = readFileSync(SERVED, "utf8");
  assert.match(text, /^# \{ "Depends": "py-genlayer:/);
  assert.match(text, /class Recused\(gl\.Contract\)/);
});

test("the served copy is identical to contracts/recused.py", { skip: !existsSync(SOURCE) && "the repository's contracts folder is not beside this site" }, () => {
  const r = compare();
  assert.equal(r.served, r.source, "run `node tools/sync-contract.mjs` to copy the repository's file over the served one");
});
