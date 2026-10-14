/* The practice desk's second track, "catch a hidden conflict", walked in headless Chrome: from the first click
 * to the hold, a clean try, an unclear try, and the catch that strikes Mara Quist's signature and pays the bounty.
 *
 *   node tools/dev.mjs                                      # demo mode on :3117 (in another terminal)
 *   node tests/site/catch.mjs                               # walks it against the in-memory contract
 *
 *   NEXT_PUBLIC_MOCK=0 NEXT_PUBLIC_CONTRACT=0x… PORT=3118 node tools/dev.mjs     # a version 2 register, with
 *   LIVE=1 BASE=http://localhost:3118 node tests/site/catch.mjs                  # REGISTRY_COMMIT set in lib/config.ts
 *
 * In demo mode the visitor is the demo account the bar under the header shows, it takes 10 GEN from the demo
 * faucet, and the notice window is skipped with the page's own demo-only button. With LIVE=1 every step is a real
 * transaction and every register page is fetched by the validators: the visitor is a throwaway key played by
 * tests/site/fake-wallet.js (never anybody's wallet), funded from Studio's faucet, and the run takes about twenty
 * minutes. Everything is observed on the page; the run fails when a row does not reach the state the script
 * expects, when a finding is not the one the register page should give, when anything is sent twice, or when the
 * page scrolls sideways at 375 px. Screenshots and report.json go under SCRATCH (the system temp folder by default).
 *
 *   HEADFUL=1   watch the browser          CHROME=/path/to/chrome   another browser binary
 *   SCRATCH=dir where the output goes      VISITOR_KEY=0x…          reuse a throwaway visitor key
 */
import { createRequire } from "node:module";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.env.LIVE === "1";
const BASE = process.env.BASE || "http://localhost:3117";
const SCRATCH = process.env.SCRATCH || path.join(os.tmpdir(), LIVE ? "recused-catch-live" : "recused-catch-demo");
const SHOTS = path.join(SCRATCH, "shots");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(SHOTS, { recursive: true });

const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(7) + "s";
const log = (...a) => {
  const line = `[${stamp()}] ${a.join(" ")}`;
  console.log(line);
  appendFileSync(path.join(SCRATCH, "run.log"), line + "\n");
};
const results = [];
let failed = 0;
const record = (ok, step, note = "") => {
  if (!ok) failed++;
  results.push({ step, result: ok ? "PASS" : "FAIL", note });
  log(`${ok ? "PASS" : "FAIL"}  ${step}${note ? "  :: " + note : ""}`);
};

const T = LIVE
  ? { setup: 300_000, call: 240_000, notice: 480_000, judged: 480_000, page: 600_000 }
  : { setup: 30_000, call: 20_000, notice: 20_000, judged: 30_000, page: 30_000 };

const visitorKey = LIVE ? process.env.VISITOR_KEY || generatePrivateKey() : "";
const visitor = LIVE ? privateKeyToAccount(visitorKey).address.toLowerCase() : "";
const consoleErrors = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: process.env.HEADFUL ? false : "new",
  userDataDir: path.join(SCRATCH, "profile-" + Date.now()),
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1280,1000"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1000 });
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 300)));
if (LIVE) {
  await page.evaluateOnNewDocument((keys) => {
    window.__FAKE_KEYS = keys;
  }, { visitor: visitorKey });
  await page.evaluateOnNewDocument(readFileSync(path.join(HERE, "fake-wallet.js"), "utf8"));
}

let shotNo = 0;
const shot = async (name) => {
  const file = path.join(SHOTS, `${String(++shotNo).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};
const rowPhase = (id) => page.$eval(`li[data-row="${id}"]`, (el) => el.getAttribute("data-phase")).catch(() => "");
const actionPhase = (id) => page.$eval(`li[data-action="${id}"]`, (el) => el.getAttribute("data-phase")).catch(() => "");
const rowText = (id) => page.$eval(`li[data-row="${id}"]`, (el) => el.innerText).catch(() => "");
const calls = () =>
  page.$$eval("li[data-action]", (els) =>
    els.map((el) => ({ id: el.getAttribute("data-action"), phase: el.getAttribute("data-phase"), hash: el.querySelector("a[title^='0x']")?.getAttribute("title") ?? "" })),
  );

async function waitFor(what, fn, timeout, every = 500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* between two renders */
    }
    await sleep(every);
  }
  throw new Error(`timed out after ${Math.round(timeout / 1000)} s waiting for ${what}`);
}
const waitRow = (id, phases, timeout) =>
  waitFor(`row ${id} to be ${phases.join(" or ")}`, async () => (phases.includes(await rowPhase(id)) ? await rowPhase(id) : ""), timeout);
const waitAction = (id, phases, timeout) =>
  waitFor(`call ${id} to be ${phases.join(" or ")}`, async () => {
    const p = await actionPhase(id);
    if (p === "stopped" && !phases.includes("stopped")) throw new Error("stopped");
    return phases.includes(p) ? p : "";
  }, timeout);
async function click(label, timeout = 15_000) {
  await waitFor(`the button "${label}" to be enabled`, () =>
    page.evaluate((text) => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => x.innerText.trim().startsWith(text) && !x.disabled);
      if (!b) return false;
      b.scrollIntoView({ block: "center" });
      b.click();
      return true;
    }, label), timeout);
}
const sideways = () => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
async function phoneCheck(name) {
  await page.setViewport({ width: 375, height: 812 });
  await sleep(600);
  const over = await sideways();
  const wide = over
    ? await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.right > document.documentElement.clientWidth + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} "${(el.innerText ?? "").slice(0, 40)}" right=${Math.round(r.right)}`);
          if (out.length >= 5) break;
        }
        return out;
      })
    : [];
  const file = await shot(`phone-${name}`);
  record(over === 0, `375 px, ${name}: no sideways scroll`, over ? `${over} px over; ${wide.join(" | ")}` : path.basename(file));
  await page.setViewport({ width: 1280, height: 1000 });
  await sleep(300);
}
const finding = (verdict) => page.$(`li[data-row="catch"] [data-challenge="${verdict}"]`);

let report = {};
try {
  log(`${LIVE ? "LIVE on GenLayer Studio" : "demo mode"} at ${BASE}/practice?track=catch${LIVE ? `, visitor ${visitor}` : ""}`);
  await page.goto(BASE + "/practice?track=catch", { waitUntil: "networkidle2", timeout: 120_000 });
  await waitFor("the catch track", () => page.$('[data-track-body="catch"]'), 60_000);
  const shut = await page.evaluate(() => /cannot start on this site yet/.test(document.body.innerText));
  if (shut) {
    record(!LIVE, "the track says why it cannot start while the register's commit is not set", "REGISTRY_COMMIT is empty");
    throw new Error(LIVE ? "set REGISTRY_COMMIT in lib/config.ts and restart the site" : "the demo mode should run the track");
  }
  const intro = await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
  record(/four practice accounts/i.test(intro) && /test GEN only/i.test(intro), "the page says which accounts are its own");
  await phoneCheck("before the start");

  if (LIVE) {
    await fetch("https://studio.genlayer.com/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sim_fundAccount", params: { account_address: getAddress(visitor), amount: 10e18 } }),
    });
    await click("Connect wallet");
    await waitFor("the wallet to connect", () => page.evaluate((a) => document.body.innerText.toLowerCase().includes(a.slice(0, 6)), visitor), 60_000);
  } else {
    await click("Get 10 test GEN");
    await waitFor("the demo faucet", () => page.evaluate(() => /10 GEN/.test(document.body.innerText)), 10_000);
  }

  await click("Set up the register desk");
  await waitRow("accounts", ["done"], T.setup);
  record(true, "1 four practice accounts, funded from the faucet");
  await waitRow("desk", ["done"], T.setup);
  const desk = await rowText("desk");
  record(/registry\//.test(desk) && /Mara Quist/.test(desk), "2 the desk names the register, and four members enrolled with stakes", desk.split("\n").slice(1, 3).join(" "));
  await waitAction("post", ["done"], T.call);
  record(true, "3 Ines posts the spend to Gull Catering");

  // Bond credit during the notice window, so that only the challenges have to fit inside the hold.
  await click("Deposit bond credit", T.call);
  await waitRow("bond", ["done"], T.call);
  record(/Your bond credit: 0\.1 GEN/.test(await rowText("bond")), "5 the visitor puts up 0.1 GEN of bond credit", (await rowText("bond")).split("\n").slice(2, 3).join(" "));
  await shot("notice");

  if (!LIVE) await click("Demo mode only: skip the wait", T.notice);
  await waitAction("signMara", ["done"], T.notice + T.judged);
  await waitAction("signTomas", ["done"], T.judged);
  await waitFor("the hold", async () => /is in its hold/.test(await rowText("signs")), T.judged);
  const signs = await rowText("signs");
  record(/Mara Quist and Tomas Brandt/.test(signs), "4 Mara and Tomas read clear, and the spend goes into its hold", signs.split("\n").slice(1, 2).join(" "));
  await shot("hold");
  await phoneCheck("in the hold");

  // The clean try: the Pelican Press page names Mara only for the print shop she filed.
  await click("Cite Pelican Press against Mara", T.call);
  await waitFor("the clean finding", () => finding("clean"), T.page);
  record(true, "6a the Pelican Press page reads clean: the bond goes to Mara");
  // The unclear try: the Heron Signs page never names the other signer.
  await click("Cite Heron Signs against", T.call);
  await waitFor("the unclear finding", () => finding("unclear"), T.page);
  record(true, "6b the Heron Signs page reads unclear: nothing moves");
  // The catch.
  await click("Catch Mara Quist", T.call);
  await waitFor("the hidden finding", () => finding("hidden"), T.page);
  const caught = await rowText("catch");
  record(/Caught\. Mara Quist's signature is struck/.test(caught), "6c the Gull Catering page reads hidden: struck, and the bounty paid to the visitor", caught.split("\n").find((l) => l.startsWith("Caught")) ?? "");
  await waitFor("the bounty to land", () => page.$('[data-bounty="landed"]'), LIVE ? 240_000 : 20_000).catch(() => null);
  record(!!(await page.$('[data-bounty="landed"]')), "the visitor's balance shows the bounty arriving", await page.$eval("[data-bounty]", (el) => el.innerText).catch(() => ""));
  await shot("caught");
  await phoneCheck("after the catch");

  // open, four enrolments, the spend, two countersignatures, the deposit and three challenges: twelve.
  const all = await calls();
  const hashes = all.map((c) => c.hash).filter(Boolean);
  record(hashes.length >= 12 && new Set(hashes).size === hashes.length, "every call has its own transaction, and none appears under two calls", `${hashes.length} transactions`);

  // The spend page shows the struck reading and every challenge.
  const spendHref = await page.evaluate(() => Array.from(document.querySelectorAll("a")).find((a) => /and its challenges/.test(a.innerText))?.getAttribute("href") ?? "");
  if (spendHref && !LIVE) {
    // Demo mode keeps nothing across a reload, so the spend page is read in the same document, through the client router.
    await page.evaluate((href) => Array.from(document.querySelectorAll("a")).find((a) => a.getAttribute("href") === href)?.click(), spendHref);
    await waitFor("the spend page", () => page.evaluate(() => location.pathname.startsWith("/spend/")), 30_000);
    await waitFor("the spend page's challenges", () => page.$$eval('section[aria-labelledby="register-title"] [data-challenge]', (els) => els.length >= 3), 30_000);
    const struck = await waitFor("the struck reading", () => page.$('[data-struck="yes"]'), 30_000).catch(() => null);
    record(!!struck, "the spend page shows the struck reading, struck through, and the three challenges");
    await shot("spend-page");
    await phoneCheck("the spend page");
  }

  report = { calls: all };
} catch (e) {
  record(false, "the walk stopped", String(e?.message ?? e));
  await shot("stopped");
  report = { calls: await calls().catch(() => []) };
} finally {
  const out = { mode: LIVE ? "live" : "demo", base: BASE, visitor, seconds: Math.round((Date.now() - t0) / 1000), results, consoleErrors, ...report };
  writeFileSync(path.join(SCRATCH, "report.json"), JSON.stringify(out, null, 2));
  log(`report: ${path.join(SCRATCH, "report.json")}`);
  if (consoleErrors.length) log(`console errors: ${consoleErrors.length}; first: ${consoleErrors[0]}`);
  await browser.close();
}
log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
