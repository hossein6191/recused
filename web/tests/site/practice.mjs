/* The practice desk, walked from the first click to the payment and then the recusal, in headless Chrome.
 *
 *   node tools/dev.mjs                                      # demo mode on :3117 (in another terminal)
 *   node tests/site/practice.mjs                            # walks it against the in-memory contract
 *
 *   NEXT_PUBLIC_MOCK=0 NEXT_PUBLIC_CONTRACT=0x… PORT=3118 node tools/dev.mjs
 *   LIVE=1 BASE=http://localhost:3118 node tests/site/practice.mjs   # the same walk on GenLayer Studio
 *
 * In demo mode the visitor is the demo account the bar under the header shows, and the wait for the
 * notice window is skipped with the page's own demo-only button. With LIVE=1 every step is a real
 * transaction: the visitor is a throwaway key played by tests/site/fake-wallet.js (never anybody's
 * wallet), the page reloads once in the middle of the notice window to show that it resumes, and
 * the run takes about a quarter of an hour, ten minutes of it the two notice windows.
 *
 * Everything is observed on the page: the state of each row and each call, the transaction links,
 * the stored pair of every reading and the payee's balance. The run fails when a row does not
 * reach the state the script expects, when anything is sent twice, or when the page scrolls
 * sideways at 375 px. Screenshots and report.json go under SCRATCH (the system temp folder by
 * default). puppeteer-core and a local Chrome are needed to run it; the site itself needs neither.
 *
 * With LIVE=1 RELOADS=1 the page is also reloaded at the three worst moments (while the faucet is
 * being asked, while the desk's first calls are with the validators, and while the visitor's own
 * countersignature is), and at the end the desk is read back from the chain and counted: four
 * members, two spends, one identification, three readings, and nothing more.
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
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.env.LIVE === "1";
const RELOADS = LIVE && process.env.RELOADS === "1";
const BASE = process.env.BASE || "http://localhost:3117";
const SCRATCH = process.env.SCRATCH || path.join(os.tmpdir(), LIVE ? "recused-practice-live" : "recused-practice-demo");
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

// How long each kind of step may take. The in-memory contract answers in a second or two.
const T = LIVE
  ? { setup: 240_000, call: 240_000, notice: 480_000, judged: 420_000, money: 240_000 }
  : { setup: 30_000, call: 20_000, notice: 20_000, judged: 30_000, money: 20_000 };

const visitorKey = LIVE ? process.env.VISITOR_KEY || generatePrivateKey() : "";
const visitor = LIVE ? privateKeyToAccount(visitorKey).address.toLowerCase() : "";

const consoleErrors = [];
const failedRequests = [];

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
page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ""}`));
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

// ---- what the page says ----------------------------------------------------------------------

const rowPhase = (id) => page.$eval(`li[data-row="${id}"]`, (el) => el.getAttribute("data-phase")).catch(() => "");
const actionPhase = (id) => page.$eval(`li[data-action="${id}"]`, (el) => el.getAttribute("data-phase")).catch(() => "");
const rowText = (id) => page.$eval(`li[data-row="${id}"]`, (el) => el.innerText).catch(() => "");

/** Every call the page shows: its state, its transaction, and what the page says about it. */
const calls = () =>
  page.$$eval("li[data-action]", (els) =>
    els.map((el) => ({
      id: el.getAttribute("data-action"),
      phase: el.getAttribute("data-phase"),
      hash: el.querySelector("a[title^='0x']")?.getAttribute("title") ?? "",
      text: el.innerText.replace(/\s+/g, " ").trim(),
    })),
  );

/** The practice desk as the page stored it (LIVE only; demo mode keeps nothing). */
const stored = () =>
  page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("recused:practice:")) return JSON.parse(localStorage.getItem(k) || "null");
    }
    return null;
  });

async function waitFor(what, fn, timeout, every = 500) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch {
      /* the page was between two renders */
    }
    await sleep(every);
  }
  throw new Error(`timed out after ${Math.round(timeout / 1000)} s waiting for ${what}`);
}

const waitRow = (id, phases, timeout) => waitFor(`row ${id} to be ${phases.join(" or ")}`, async () => {
  const p = await rowPhase(id);
  return phases.includes(p) ? p : "";
}, timeout);
const waitAction = (id, phases, timeout) => waitFor(`call ${id} to be ${phases.join(" or ")}`, async () => {
  const p = await actionPhase(id);
  if (p === "stopped" && !phases.includes("stopped")) throw new Error("stopped");
  return phases.includes(p) ? p : "";
}, timeout);

/** Clicks the first enabled button whose text starts with `label`. */
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

/** How far the page scrolls sideways, in px; 0 is what a phone needs. */
const sideways = () => page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
async function phoneCheck(name) {
  // Width and height only: switching puppeteer's mobile emulation reloads the page, and demo mode keeps nothing across a reload.
  await page.setViewport({ width: 375, height: 812 });
  await sleep(600);
  const over = await sideways();
  const wide = over
    ? await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("main *")) {
          const r = el.getBoundingClientRect();
          if (r.right > document.documentElement.clientWidth + 1 && r.width > 0) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`);
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

/** A reload at a bad moment: the page must come back with the same desk and carry on by itself. */
async function reloadNow(why) {
  const before = await stored();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitFor("the rows after a reload", () => page.$('li[data-row="accounts"]'), 60_000);
  const after = await stored();
  const kept = !!after && after.startedAt === before?.startedAt && after.addresses.teacher === before?.addresses.teacher;
  record(kept, `reload ${why}: the same practice desk is still there`, kept ? `teacher ${after.addresses.teacher}` : "the stored state changed");
}

/**
 * One view of the register, read from node. Studio finds a contract only under its checksummed
 * address (the page keeps the lowercase spelling for its own storage key), and answers "not
 * found" for a healthy one now and then: a few tries.
 */
async function view(registerLower, fn, args) {
  const register = getAddress(registerLower);
  const client = createClient({ chain: { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: ["https://studio.genlayer.com/api"] } } } });
  let last;
  for (let i = 0; i < 6; i++) {
    try {
      const raw = await client.readContract({ address: register, functionName: fn, args });
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      last = e;
      await sleep(4000 * (i + 1));
    }
  }
  throw last;
}

/** What the chain holds for this practice desk, counted: anything sent twice would show here. */
async function audit(st) {
  const d = st.desk;
  const desk = await view(st.register, "desk", [d]);
  const spends = await view(st.register, "spends", [d]);
  const idents = await view(st.register, "idents", [d, String(st.s2.n)]);
  const r1 = await view(st.register, "readings", [d, String(st.s1.n)]);
  const r2 = await view(st.register, "readings", [d, String(st.s2.n)]);
  const row = (n) => spends.rows.find((x) => x.spend === "S" + n) ?? {};
  const facts = {
    members: desk.members,
    spends: desk.spends,
    paid: desk.paid,
    pot: desk.pot,
    s1: `${row(st.s1.n).state}, ${row(st.s1.n).approvals} approvals, ${row(st.s1.n).n_attempts} readings`,
    s2: `${row(st.s2.n).state}, ${row(st.s2.n).approvals} approvals, ${row(st.s2.n).n_attempts} readings, ${row(st.s2.n).n_idents} identification`,
    idents: idents.rows.map((x) => `M${x.member}: ${x.text}`),
    readings1: r1.rows.map((x) => `${x.number} ${x.value} ${x.verdict}`),
    readings2: r2.rows.map((x) => `${x.number} ${x.value} ${x.verdict}`),
  };
  const once = desk.members === 4 && desk.spends === 2 && idents.rows.length === 1 && r1.rows.length === 2 && r2.rows.length === 1;
  record(once, "read back from the chain: four members, two spends, one identification, three readings", JSON.stringify(facts));
  return facts;
}

// ---- the walk ----------------------------------------------------------------------------------

let report = {};
try {
  log(`${LIVE ? "LIVE on GenLayer Studio" : "demo mode"} at ${BASE}/practice${LIVE ? `, visitor ${visitor}` : ""}`);
  await page.goto(BASE + "/practice", { waitUntil: "networkidle2", timeout: 120_000 });
  await waitFor("the start button", () => page.evaluate(() => !!Array.from(document.querySelectorAll("button")).find((b) => b.innerText.includes("Set up my practice desk"))), 60_000);
  const intro = await page.evaluate(() => document.querySelector("main")?.innerText ?? document.body.innerText);
  record(/practice accounts, held in this browser/i.test(intro) && /not\s+anybody.s wallet/i.test(intro) && /test GEN only/i.test(intro), "the page says what the practice accounts are", "");
  await shot("start");
  await phoneCheck("before the start");

  if (LIVE) {
    await click("Connect wallet");
    await waitFor("the wallet to connect", () => page.evaluate((a) => document.body.innerText.toLowerCase().includes(a.slice(0, 6)), visitor), 60_000);
    record(true, "the visitor's wallet connects", visitor);
  }

  await click("Set up my practice desk");
  if (RELOADS) {
    await sleep(1200);
    await reloadNow("while the faucet is being asked");
    await waitFor("a call of the desk's to be with the validators", async () => (await calls()).some((c) => ["open", "enrolTeacher", "enrolPrinter", "enrolNurse"].includes(c.id) && c.phase === "onchain"), T.setup, 200);
    await reloadNow("while the desk's first calls are with the validators");
  }
  await waitRow("accounts", ["done"], T.setup);
  record(true, "1 accounts: three keys made and funded from the faucet");
  await waitRow("desk", ["done"], T.setup);
  record(true, "2 desk: opened with its pot, and the three practice members enrolled", (await rowText("desk")).split("\n").slice(1, 2).join(" "));
  await shot("desk-open");

  // The order the page enforces: the spend is not posted while the visitor has not enrolled.
  await sleep(LIVE ? 6000 : 1500);
  const early = await actionPhase("post1");
  record(early === "waiting", "the spend is held back until the visitor has enrolled", `post1 is ${early || "not shown"}`);

  await click("File my disclosure");
  await waitRow("enrol", ["done"], T.call);
  record(true, "3 enrol: the visitor's own disclosure is on chain", (await rowText("enrol")).split("\n").slice(1, 2).join(" "));

  await waitAction("post1", ["done"], T.call);
  record(true, "4 spend: posted after the visitor's disclosure", (await rowText("spend")).split("\n").slice(1, 2).join(" "));
  await waitFor("the countdown", () => page.$('[data-countdown]'), 60_000);
  record(true, "the notice window counts down on the page", await page.$eval("[data-countdown]", (el) => el.innerText.split("\n")[0]));
  await shot("notice-window");
  await phoneCheck("during the notice window");

  // The contrast, started while the first window runs.
  await click("Post the print shop spend");
  await waitAction("post2", ["done"], T.call);
  await waitAction("identify2", ["done"], T.call);
  const ident = (await calls()).find((c) => c.id === "identify2");
  record(!/too little left|none was sent/i.test(ident?.text ?? ""), "7a contrast: posted, and its payee identified inside the notice window", ident?.text.slice(0, 160));

  if (LIVE) {
    // A reload in the middle of the wait: the page must carry on, and send nothing again.
    const before = await stored();
    await page.reload({ waitUntil: "networkidle2", timeout: 120_000 });
    await waitFor("the rows after a reload", () => page.$('li[data-row="spend"]'), 60_000);
    await waitFor("the countdown after a reload", () => page.$("[data-countdown]"), 90_000);
    const after = await stored();
    const same = ["open", "enrolTeacher", "enrolPrinter", "enrolNurse", "enrolYou", "post1", "post2", "identify2"].every((id) => before.actions[id].hash === after.actions[id].hash && after.actions[id].phase === "done");
    record(same && before.desk === after.desk, "a reload in the notice window resumes the same desk and sends nothing again", `desk ${after.desk}, S${after.s1?.n} and S${after.s2?.n}`);
    await shot("after-reload");
  } else {
    await click("Demo mode only: skip the wait");
  }

  await click("Countersign S", T.notice);
  if (RELOADS) {
    await waitAction("signYou", ["onchain"], 60_000);
    await reloadNow("while the visitor's countersignature is with the validators");
  }
  await waitFor("the visitor's reading", async () => ["done", "recused"].includes(await rowPhase("sign")) && (await page.$('li[data-row="sign"] blockquote')), T.judged);
  const mine = await rowText("sign");
  record(true, "5 countersign: the visitor is read under both branches", mine.replace(/\s+/g, " ").slice(0, 400));
  await shot("visitor-reading");

  await waitAction("signPrinter", ["done"], T.judged);
  await waitFor("the pay row to settle", async () => ["done", "refused", "stopped"].includes(await rowPhase("pay")), T.judged);
  const pay = await rowText("pay");
  const paid = /^Paid\./m.test(pay) || /Paid\. The second clear countersignature/.test(pay);
  record(paid, "6 the second countersignature pays the payee from the pot", pay.replace(/\s+/g, " ").slice(0, 300));
  if (paid) {
    await waitFor("the transfer to land", () => page.$('[data-payment="landed"]'), T.money);
    record(true, "the payee's balance shows the money arriving", await page.$eval("[data-payment]", (el) => el.innerText.split("\n")[0]));
  }
  await shot("paid");

  await waitAction("sign2", ["done"], T.notice + T.judged);
  await waitFor("the contrast reading", () => page.$('li[data-row="contrast"] blockquote'), 30_000);
  const contrast = await rowText("contrast");
  record(/Refused, and published/.test(contrast), "7b contrast: the print shop co-owner is refused on the spend that pays the shop", contrast.replace(/\s+/g, " ").slice(0, 400));
  await shot("contrast");
  await phoneCheck("at the end");

  const all = await calls();
  const hashes = all.map((c) => c.hash).filter(Boolean);
  record(new Set(hashes).size === hashes.length, "no transaction appears under two calls", `${hashes.length} transactions`);
  report = { calls: all, stored: LIVE ? await stored() : null };
  if (report.stored) delete report.stored.keys;
  if (LIVE && report.stored?.s1 && report.stored?.s2) report.chain = await audit(report.stored);
} catch (e) {
  record(false, "the walk stopped", String(e?.message ?? e));
  await shot("stopped");
  report = { calls: await calls().catch(() => []), stored: LIVE ? await stored().catch(() => null) : null };
  if (report.stored) delete report.stored.keys;
} finally {
  const out = { mode: LIVE ? "live" : "demo", base: BASE, visitor, seconds: Math.round((Date.now() - t0) / 1000), results, consoleErrors, failedRequests: failedRequests.slice(0, 40), ...report };
  writeFileSync(path.join(SCRATCH, "report.json"), JSON.stringify(out, null, 2));
  log(`report: ${path.join(SCRATCH, "report.json")}`);
  for (const c of report.calls ?? []) log(`  ${String(c.id).padEnd(13)} ${String(c.phase).padEnd(8)} ${c.hash}`);
  if (consoleErrors.length) log(`console errors: ${consoleErrors.length}; first: ${consoleErrors[0]}`);
  await browser.close();
}
log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
