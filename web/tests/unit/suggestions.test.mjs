// Every one-click suggestion version 2 offers, and every text the catch track files, checked against
// the limits written in the contract the site serves, from node:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/suggestions.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CHALLENGE_BOND_ATTO, STAKE_ATTO, pageProblem, publicNameProblem, registriesProblem } from "../../lib/contract.ts";
import { CAST, POT_ATTO, ROLES, SPEND, STAKE_ATTO as CATCH_STAKE, BOND_DEPOSIT_ATTO, HOLD_MINUTES, WINDOW_MINUTES, TRY_PAGE, deskLabel } from "../../lib/catch.ts";
import { REGISTER_PAGES, registryPrefixAt } from "../../lib/registry.ts";
import { BOND_SUGGESTIONS, HOLD_SUGGESTIONS, PUBLIC_NAME_SUGGESTIONS, STAKE_SUGGESTIONS, pageSuggestions, registrySuggestions } from "../../lib/suggestions.ts";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "contracts", "recused.py"), "utf8");
const limit = (name) => {
  const m = new RegExp("^" + name + " = (\\d+)\\b", "m").exec(source);
  assert.ok(m, "the contract no longer defines " + name);
  return Number(m[1]);
};
const GEN = 10n ** 18n;
const relations = /^RELATIONS = \(([^)]*)\)/ms.exec(source)?.[1] ?? "";
const fits = (text, least, most, what) => {
  assert.ok(text.length >= least && text.length <= most, `${what} is ${text.length} characters, outside ${least} to ${most}`);
  assert.equal(/^[\x20-\x7e]+$/.test(text), true, what + " is not printable ASCII on one line");
  assert.equal(/[<>"]/.test(text), false, what + " holds a character the contract refuses");
};

test("every public name suggested is one enrol() takes", () => {
  assert.ok(PUBLIC_NAME_SUGGESTIONS.length >= 3);
  for (const n of PUBLIC_NAME_SUGGESTIONS) {
    assert.equal(publicNameProblem(n), "", n);
    fits(n, limit("MIN_PUBLIC_NAME"), limit("MAX_PUBLIC_NAME"), n);
  }
});

test("every hold, stake and bond suggested is inside the contract's range", () => {
  for (const h of HOLD_SUGGESTIONS) assert.ok(h.value >= limit("MIN_HOLD_MINUTES") && h.value <= limit("MAX_HOLD_MINUTES"), h.label);
  for (const s of STAKE_SUGGESTIONS) assert.ok(s.value >= STAKE_ATTO[0] && s.value <= STAKE_ATTO[1], s.label);
  assert.equal(STAKE_SUGGESTIONS[0].value, GEN / 10n, "the least stake is offered first");
  for (const b of BOND_SUGGESTIONS) {
    assert.ok(b.value >= CHALLENGE_BOND_ATTO, b.label);
    assert.equal(b.value % CHALLENGE_BOND_ATTO, 0n, b.label + " covers a whole number of challenges");
  }
});

test("every register suggested is a prefix open_desk() takes, and every page suggested is one challenge() reads", () => {
  for (const r of registrySuggestions()) assert.equal(registriesProblem([r.value]).problem, "", r.value);
  const prefix = registryPrefixAt("0123456789abcdef0123456789abcdef01234567");
  assert.equal(registriesProblem([prefix]).problem, "", "a pinned prefix");
  const pages = pageSuggestions([prefix, "https://registry.example/companies/"]);
  assert.equal(pages.length, REGISTER_PAGES.length + 1);
  for (const p of pages.slice(0, REGISTER_PAGES.length)) assert.equal(pageProblem(p.value, [prefix]), "", p.value);
  assert.equal(pages.at(-1).value, "https://registry.example/companies/", "another register is offered as its prefix, to finish");
  for (const t of Object.values(TRY_PAGE)) assert.ok(REGISTER_PAGES.some((p) => p.file === t), t);
});

test("every text the catch track files fits the contract, and the script fits its caps and its money", () => {
  for (const r of ROLES) {
    const c = CAST[r];
    fits(c.statement, limit("MIN_STATEMENT"), limit("MAX_STATEMENT"), r + ": the statement");
    fits(c.publicName, limit("MIN_PUBLIC_NAME"), limit("MAX_PUBLIC_NAME"), r + ": the public name");
    for (const e of c.entries) {
      fits(e.name, limit("MIN_ENTRY_NAME"), limit("MAX_ENTRY_NAME"), r + ": an entry name");
      fits(e.detail, 1, limit("MAX_ENTRY_DETAIL"), r + ": an entry detail");
      assert.ok(relations.includes(`"${e.relation}"`), r + ": " + e.relation);
    }
  }
  fits(SPEND.description, limit("MIN_DESCRIPTION"), limit("MAX_DESCRIPTION"), "the spend's description");
  fits(deskLabel("0x" + "a".repeat(40)), limit("MIN_LABEL"), limit("MAX_LABEL"), "the desk's name");
  assert.ok(CATCH_STAKE >= STAKE_ATTO[0] && CATCH_STAKE <= STAKE_ATTO[1]);
  assert.ok(HOLD_MINUTES >= limit("MIN_HOLD_MINUTES") && HOLD_MINUTES <= limit("MAX_HOLD_MINUTES"));
  assert.ok(WINDOW_MINUTES >= limit("MIN_NOTICE_MINUTES") + limit("MIN_LIVE_MINUTES") && WINDOW_MINUTES <= limit("MAX_WINDOW_MINUTES"));
  assert.ok(SPEND.amountAtto <= POT_ATTO, "the spend fits the pot");
  assert.ok(10n * GEN >= POT_ATTO + CATCH_STAKE, "Ines's faucet GEN covers the pot and her stake");
  assert.ok(BOND_DEPOSIT_ATTO >= 2n * CHALLENGE_BOND_ATTO, "the suggested deposit covers the clean try and the catch");
  // The story the register tells: only Mara is on the Gull Catering page, and her disclosure never says so.
  const filed = (r) => (CAST[r].statement + " " + CAST[r].entries.map((e) => e.name + " " + e.detail).join(" ")).toLowerCase();
  for (const r of ROLES) assert.equal(filed(r).includes("gull"), false, r + " mentions Gull Catering");
  assert.equal(CAST.mara.publicName, "Mara Quist");
  assert.ok(filed("mara").includes("pelican press"));
});
