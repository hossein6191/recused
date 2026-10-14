// What a public repository must not carry, and what the demo mode must not get wrong, checked over
// every source file of the site, from node:
//
//   node --import ./tests/unit/ts-resolve.mjs --test tests/unit/hygiene.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { REGISTER_PAGES, REGISTER_TEXT } from "../../lib/registry.ts";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = new Set(["node_modules", ".next", "out", "build", ".vercel"]);
const TEXT = /\.(ts|tsx|mjs|js|css|json|md|py|svg|txt|example)$/;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith("._") || name.startsWith(".DS_Store")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (TEXT.test(name) || name === ".env.example") out.push(p);
  }
  return out;
}
const all = files(web).filter((p) => !p.endsWith("package-lock.json"));
const sourceOf = (p) => readFileSync(p, "utf8");
const own = (p) => /\/(app|components|lib)\//.test(p);

/**
 * Words that must never appear in this repository, kept as the start of their sha256 so that this
 * file does not carry them either: two place names, a language, an assistant's credit, and two
 * personal account names.
 */
const NEVER = new Set(["d4328f17fc46dfde", "6ab4a31413e4329f", "160090fa99085617", "c857d09db23e6822", "c70eca6b0f88f44d", "66b87014eaa25f28", "cfd981384d5e04aa"]);
const wordHash = (w) => createHash("sha256").update(w).digest("hex").slice(0, 16);

test("nothing personal and nothing internal in the site's files", () => {
  assert.ok(all.length > 60, "the scan found the site's files");
  for (const p of all) {
    const text = sourceOf(p);
    const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    for (const w of words) assert.ok(!NEVER.has(wordHash(w)), `${relative(web, p)} holds a word this repository must not carry`);
    assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|proton)\./i, `${relative(web, p)} holds a personal email address`);
    assert.doesNotMatch(text, /\/Users\/|\/Volumes\//, `${relative(web, p)} holds a path on somebody's machine`);
  }
});

test("the repository owner's handle appears only where the site names its own repository", () => {
  for (const p of all.filter(own)) {
    if (p.endsWith("lib/config.ts")) continue;
    assert.doesNotMatch(sourceOf(p), /hossein6191/, relative(web, p));
  }
});

test("no private key and no stray logging in the site's own code", () => {
  for (const p of all.filter(own)) {
    const text = sourceOf(p);
    assert.doesNotMatch(text, /["'`]0x[0-9a-fA-F]{64}["'`]/, `${relative(web, p)} holds what looks like a private key`);
    assert.doesNotMatch(text, /console\.(log|debug)\(/, `${relative(web, p)} logs to the console`);
  }
});

test("every route has its own title, and the member page is one of them", () => {
  const app = join(web, "app");
  const routes = files(app).filter((p) => p.endsWith("/page.tsx")).map((p) => dirname(p));
  for (const r of routes) {
    if (r === app) continue;
    assert.ok(existsSync(join(r, "layout.tsx")), relative(web, r) + " has no layout with its title");
  }
  assert.ok(routes.some((r) => r.endsWith("/member")));
});

test("demo mode serves the register pages exactly as registry/ holds them", { skip: !existsSync(join(web, "..", "registry")) && "the repository's registry folder is not beside this site" }, () => {
  for (const page of REGISTER_PAGES) {
    const html = readFileSync(join(web, "..", "registry", page.file), "utf8");
    const pre = /<pre>\n([\s\S]*?)<\/pre>/.exec(html)?.[1];
    assert.ok(pre, page.file + " has its one pre block");
    assert.equal(REGISTER_TEXT[page.file], pre, page.file);
    assert.ok(pre.includes("Company name: " + page.company), page.file);
  }
});
