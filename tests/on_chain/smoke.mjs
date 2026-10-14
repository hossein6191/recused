/* Recused version 2 against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copies.
 *
 *   npm ci                                                  # genlayer-js 1.1.8 and viem 2.56.8, pinned
 *   COMMIT=<sha> node tests/on_chain/smoke.mjs              # the whole run, about two hours (two holds of 45 min)
 *   COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs     # continue a run that was cut off, from the saved state
 *
 * The validators read the register pages in registry/ from raw.githubusercontent.com, pinned to one commit, so
 * the page every node fetches is the same bytes and nobody can change it after the desk named it. Push the
 * repository first and pass that commit as COMMIT (40 hex characters). REPO is "<owner>/<name>" on GitHub;
 * when it is not set it is read from `git remote get-url origin`. The script checks that the pinned pages are
 * the files in this checkout before it sends anything.
 *
 * Six generated accounts: A opens the desk and keeps the residents association's minutes (Ines Corrie), B part
 * owns Pelican Press, a print shop, with her sister and files a disclosure that never mentions Gull Catering, of
 * which she is a director (Mara Quist), C chairs the bike group (Tomas Brandt), D teaches at the school (Elin
 * Varga), S is a stranger who never enrols, and P is Gull Catering's address, which never signs. Q, Pelican
 * Press's address, is a payee too and never signs. No disclosure competes with a caterer, so B's hidden
 * directorship is the only thing linking any member to S1, and C's disclosure names no claim on the fund.
 *
 * Phases:
 *   A  deploy both contracts; a desk with a hold under the floor is refused and its value comes back; the desk
 *      is opened with 20 GEN, the pinned registry/ folder as its one register, a member stake of 0.5 GEN, a
 *      hold of 45 minutes and a notice of 5; an enrolment that sends the wrong stake is refused and the value
 *      comes back in the same transaction; A, B, C and D enrol with 0.5 GEN each.
 *   B  A posts S1 to P, refreshments for the street open day from Gull Catering Ltd, with a window of three
 *      hours; D posts S2 to Q, the minutes book from Pelican Press, and S3 to A's own address; D deposits 1 GEN
 *      on the Countersigned fixture, bound to S1; S, who never enrols, deposits 0.2 GEN of bond credit, so that
 *      nothing but the challenges themselves has to fit inside the hold.
 *   C  after the notice: version 1 still holds (B is read interested on S2, and A's countersignature on a spend
 *      to A's own address is declared, with no model asked); B and C read clear on S1, which goes into its hold
 *      and pays nothing; release before the hold ends is refused, and so is the fixture's release.
 *   D  a challenge citing a page outside the desk's register is refused before any page is fetched; S cites
 *      pelican-press-ltd.html against B: it names Mara Quist, but only for the print shop she disclosed, and
 *      says nothing about Gull Catering: clean, and the bond goes to B; S cites gull-catering-ltd.html against
 *      B, a director of Gull Catering since 2019: hidden, B's signature struck, 0.25 GEN paid to S and 0.25 GEN
 *      into the desk in that transaction, S1 open again. Before each challenge the script reads the spend and
 *      stops unless at least five minutes of the hold are left.
 *   E  D reads clear and S1 is in its hold again; S cites gull-catering-ltd.html against C, Tomas Brandt, whose
 *      name is not on it: unclear, so the bond stays in S's credit and nothing changes (a page that never names
 *      a member cannot pay that member a bond); the same page cited against C again is refused (each page is
 *      read once against each signature); once the hold has run out S releases S1 and P is paid in that
 *      transaction; the fixture pays its deposit on S1; B restakes; A retires and takes its stake back; S takes
 *      back its bond credit; S2 and S3 expire.
 *   F  the deployed code is read back and compared with these files byte for byte, the views are read and
 *      checked against what the run did, and every account's balance against the money table.
 *
 * Every refusal is a signed transaction. Payments are read from balances after finalisation. Transactions are
 * polled with eth_getTransactionByHash, never with views. A round the validators do not carry stores nothing; it
 * is sent again and both transactions are kept. Every step is saved as it is made, so a run that is cut off
 * continues without sending twice. Ids are read from the receipts, and every wait is on the chain's own clock.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const STATE = process.env.STATE || join(tmpdir(), "recused-v2-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const GEN = 10n ** 18n;
const gen = (n) => String(BigInt(n) * GEN);
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ---------- where the validators will read the register ----------
const COMMIT = String(process.env.COMMIT || "").trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.log("COMMIT must be the 40-character commit registry/ was pushed in: COMMIT=<sha> node tests/on_chain/smoke.mjs");
  process.exit(2);
}
let REPO = String(process.env.REPO || "").trim();
if (!REPO) {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).trim();
    REPO = (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch (e) { REPO = ""; }
}
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) {
  console.log("REPO must be <owner>/<name> on GitHub (or set the git remote origin): REPO=<owner>/recused COMMIT=<sha> ...");
  process.exit(2);
}
const REGISTRY = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/registry/`;
const PAGE = { gull: REGISTRY + "gull-catering-ltd.html", heron: REGISTRY + "heron-signs-ltd.html", pelican: REGISTRY + "pelican-press-ltd.html" };
const OUTSIDE = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/README.md`;   // the same repository, not the register
const LOCAL = {};
for (const [name, address] of Object.entries(PAGE)) {
  LOCAL[name] = readFileSync(new URL("../../registry/" + address.slice(REGISTRY.length), import.meta.url), "utf8");
  let there = "";
  try { const r = await fetch(address); there = r.ok ? await r.text() : ""; } catch (e) { there = ""; }
  if (there !== LOCAL[name]) {
    console.log(`${address}\ndoes not serve registry/${address.slice(REGISTRY.length)} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
    process.exit(2);
  }
}
// what every validator should fingerprint, if the page is read as its source: spacing collapsed, at most 8,000 characters
const fpOf = (text) => sha(text.split(/\s+/).filter(Boolean).join(" ").slice(0, 8000)).slice(0, 16);

// ---------- state: accounts, addresses and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
// the record of the run keeps which commit the validators read
st.commit = st.commit || COMMIT; st.repo = st.repo || REPO;
if (st.commit !== COMMIT) { console.log(`This saved run used commit ${st.commit}; continue it with that COMMIT, or start over with FRESH=1.`); process.exit(2); }
const ROLES = { a: "A, Ines Corrie: opens the desk, keeps the minutes", b: "B, Mara Quist: part owns Pelican Press, never mentions Gull Catering", c: "C, Tomas Brandt: chairs the bike group", d: "D, Elin Varga: teaches at the school", s: "S: a stranger who never enrols" };
for (const k of ["a", "b", "c", "d", "s", "p", "q"]) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
const P = createAccount(st.keys.p).address.toLowerCase();   // Gull Catering's address; it never signs anything
const Q = createAccount(st.keys.q).address.toLowerCase();   // Pelican Press's address; it never signs anything
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, acct[k].address]));
st.payees = { P, Q };
const low = (k) => acct[k].address.toLowerCase();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: acct[k].address, amount: whole * 1e18 });   // a checksummed address
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so
// nothing is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      let a = 0, d = 0, idl = 0;
      for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; }
      return { tx, msg, exec: one?.execution_result || "", votes: { agree: a, disagree: d, idle: idl }, applied: a * 2 > a + d + idl, address: t.data?.contract_address || t.to_address || "", outcome: t.result_name || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) {
      let a = 0, d = 0, idl = 0;
      for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; }
      return { tx, msg: "UNDETERMINED", exec: "", votes: { agree: a, disagree: d, idle: idl }, applied: false, address: "", outcome: t.result_name || "UNDETERMINED" };
    }
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "", outcome: "CANCELED" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "", outcome: "TIMEOUT" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settle = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };
const noModel = (j) => j?.kind === "procedural" && String(j?.reason).includes("a model could not be reached");

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names addresses whose balances are read before and
// after, and opt.expect the change each should show once the transfer has landed. A step that is
// already in the saved state is not sent again.
const call = async (id, who, target, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, target, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || {};
    if (!rec.before) { rec.before = {}; for (const [k, a] of Object.entries(watch)) rec.before[k] = String(await balance(a)); save(); }
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st[target], functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, outcome: r.outcome });
      rec.mid = {}; for (const [k, a] of Object.entries(watch)) rec.mid[k] = String(await balance(a));   // as finalised, before any transfer back has landed
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(0, 18)).join(", ")})${opt.value ? " +" + opt.value / GEN + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      if (noModel(jsonOf(r.msg))) { console.log("      no model could be reached, the attempt is unspent; sending it again"); continue; }
      break;
    }
    rec.after = {}; rec.delta = {};
    for (const [k, a] of Object.entries(watch)) {
      const before = BigInt(rec.before[k]);
      const want = opt.expect && opt.expect[k] !== undefined ? BigInt(opt.expect[k]) : null;
      const now = want === null ? await balance(a) : await settle(a, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {}, n: rec.tries.length };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");
// a round in which no node could reach a model is stored as a procedural refusal of its own; the ring counts allow for it
const outages = () => st.order.reduce((n, id) => n + st.steps[id].tries.filter((t) => noModel(jsonOf(t.msg))).length, 0);

const deploy = async (id, who, path, args) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, target: "", fn: "deploy " + path.split("/").pop(), args: args.map(String), value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args, leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), outcome: r.outcome });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (target, fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st[target], functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, target, fn, args = []) => { if (!st.views[id]) { st.views[id] = { target, fn, args, at: stamp(), out: await read(target, fn, args) }; save(); } return st.views[id].out; };
// wait on the chain's own clock until a spend's window (notice_until or window_until) has passed
const until = async (desk, n, field) => {
  for (;;) {
    const s = await read("recused", "spend", [desk, String(n)]);
    if (!(Number(s[field]) > 0)) { console.log(`      [${stamp()}] the spend could not be read (${s.error || "no " + field}); reading again`); await sleep(15000); continue; }
    const now = Number(s.now) > 0 ? Number(s.now) : Math.floor(Date.now() / 1000);
    const left = Number(s[field]) - now;
    if (left <= -15 || s.state !== "open") return;
    console.log(`      [${stamp()}] waiting ${left + 15}s for ${field} of ${desk} S${n}`);
    await sleep(Math.min(left + 15, 120) * 1000);
  }
};

// wait on the chain's own clock until a spend's hold has ended
const untilHold = async (desk, n) => {
  for (;;) {
    const s = await read("recused", "spend", [desk, String(n)]);
    if (!(Number(s.hold_until) > 0)) { console.log(`      [${stamp()}] the spend could not be read (${s.error || "no hold_until"}); reading again`); await sleep(15000); continue; }
    const now = Number(s.now) > 0 ? Number(s.now) : Math.floor(Date.now() / 1000);
    const left = Number(s.hold_until) - now;
    if (left <= -15 || s.state !== "holding") return;
    console.log(`      [${stamp()}] waiting ${left + 15}s for the hold of ${desk} S${n} to end`);
    await sleep(Math.min(left + 15, 120) * 1000);
  }
};
const note = (text) => console.log("      note: " + text);
// a challenge must land inside the hold: none is sent with less than five minutes of it left. A step already
// sent (a continued run) is not checked again.
const roomInHold = async (id, desk, n) => {
  if (st.steps[id]) return;
  const s = await read("recused", "spend", [desk, String(n)]);
  const now = Number(s.now) > 0 ? Number(s.now) : Math.floor(Date.now() / 1000);
  const left = Number(s.hold_until) - now;
  if (s.state === "holding" && left > 300) { console.log(`      [${stamp()}] ${left}s of the hold of ${desk} S${n} are left for ${id}`); return; }
  ok(`${id}: at least five minutes of the hold are left before the challenge is sent`, false, `${s.state}, ${left}s left`);
  console.log("The hold is too nearly over for this challenge to land inside it, so it was not sent. Start again with FRESH=1.");
  st.checks = { pass, fail }; save(); process.exit(1);
};

// ---------- the demonstration text ----------
const entries = (list) => JSON.stringify(list.map(([name, relation, detail]) => ({ name, relation, detail })));
const LABEL = "Pelican Street mutual fund";
const ST_A = "I keep the minutes of the Pelican Street Residents Association and run no business of my own.";
const EN_A = entries([["Pelican Street Residents Association", "member_of", "I keep its minutes; it holds no money and sells nothing."]]);
const ST_B = "I co-own Pelican Press, a two-person print shop on the same street, with my sister.";
const EN_B = entries([["Pelican Press", "part_owns", "A two-person print shop at the end of the street; my sister owns the other half."]]);
// no claim on the fund itself: README limit 14 measured such a disclosure reading unclear two times in five
const ST_C = "I chair the tenants' bike group, a club with its own small kitty that buys and sells nothing.";
const EN_C = entries([["Pelican Street tenants' bike group", "officer_of", "I chair it; it has its own kitty and buys nothing from anyone on this street."]]);
const ST_D = "I teach at the local school and have no business interests of any kind.";
const EN_D = entries([["Hillside Primary School", "employed_by", "I teach there; the school buys nothing from this fund and sells it nothing."]]);
const NAME = { a: "Ines Corrie", b: "Mara Quist", c: "Tomas Brandt", d: "Elin Varga" };
const DESC_GULL = "Refreshments for the street open day from Gull Catering Ltd";
const DESC_PELICAN = "Print the minutes book at Pelican Press Ltd";
const DESC_REPAY = "Repay Ines Corrie for the hall deposit she advanced";
const POT = 20n * GEN;
const STAKE = GEN / 2n, STAKE_S = String(GEN / 2n);
const BOND = GEN / 20n, CREDIT = GEN / 5n, BOUNTY = STAKE / 2n;
const REGS = JSON.stringify([REGISTRY]);
const HOLD_MIN = 45;   // the demonstration desk's hold: room for every challenge round, and for a slow one

await fundOnce("a", 30); for (const k of ["b", "c", "d", "s"]) await fundOnce(k, 5);
if (!st.start) {
  st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address));
  st.startPayees = { P: String(await balance(P)), Q: String(await balance(Q)) };
  st.started = new Date().toISOString(); save();
}
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => `${acct[k].address}  ${ROLES[k]}`).join("\n           ")}\n           payees, which never sign: Gull Catering ${P}  Pelican Press ${Q}\n           register ${REGISTRY}\n           state ${STATE}`);
st.ids = st.ids || {};

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, open the desk, enrol with a stake`);
st.recused = st.recused || await deploy("deploy", "a", "../../contracts/recused.py", []);
save();
st.fixture = st.fixture || await deploy("deployF", "a", "../../contracts/fixtures/countersigned.py", [st.recused]);
save();
console.log(`      Recused at ${st.recused}, Countersigned at ${st.fixture}`);
{
  const A = { a: acct.a.address };
  const short = await call("a1", "a", "recused", "open_desk", [LABEL, "", 5, REGS, STAKE_S, 4], { value: 3n * GEN, watch: A, expect: { a: 0n } });
  ok("a desk whose hold is under five minutes is refused, and the 3 GEN sent with it comes back in that transaction", short.exec !== "ERROR" && short.j?.ok === false && String(short.j?.reason).includes("the hold is 5 to 10080") && short.j?.returned === gen(3) && moved(short, "a", 0n), short.j?.reason?.slice(0, 90));
  const o = await call("a2", "a", "recused", "open_desk", [LABEL, "", 5, REGS, STAKE_S, HOLD_MIN], { value: POT, watch: A, expect: { a: -POT } });
  ok(`the desk is opened with 20 GEN, the pinned registry/ folder as its register, a stake of 0.5 GEN and a hold of ${HOLD_MIN} minutes`, o.j?.ok === true && JSON.stringify(o.j?.registries) === JSON.stringify([REGISTRY]) && o.j?.member_stake === STAKE_S && o.j?.hold_minutes === HOLD_MIN && o.j?.min_notice_minutes === 5 && moved(o, "a", -POT), JSON.stringify(o.j).slice(0, 200));
  st.ids.desk = st.ids.desk || o.j?.desk; save();
  const D1 = st.ids.desk;
  const wrong = await call("a3", "a", "recused", "enrol", [D1, ST_A, EN_A, "", NAME.a], { value: GEN * 2n / 5n, watch: A, expect: { a: 0n } });
  ok("an enrolment that sends 0.4 GEN instead of the desk's 0.5 is refused, and the 0.4 GEN comes back in the same transaction", wrong.exec !== "ERROR" && wrong.j?.ok === false && String(wrong.j?.reason).includes("stakes exactly " + STAKE_S) && wrong.j?.returned === String(GEN * 2n / 5n) && moved(wrong, "a", 0n), wrong.j?.reason?.slice(0, 100));
  const four = [];
  for (const [id, k, text, en] of [["a4", "a", ST_A, EN_A], ["a5", "b", ST_B, EN_B], ["a6", "c", ST_C, EN_C], ["a7", "d", ST_D, EN_D]]) {
    four.push(await call(id, k, "recused", "enrol", [D1, text, en, "", NAME[k]], { value: STAKE, watch: { [k]: acct[k].address }, expect: { [k]: -STAKE } }));
  }
  ok("A, B, C and D enrol, each staking 0.5 GEN under the name a public register would list them under", four.every((r, i) => r.j?.ok === true && r.j?.stake === STAKE_S && moved(r, ["a", "b", "c", "d"][i], -STAKE)) && four.map((r) => r.j?.public_name).join() === [NAME.a, NAME.b, NAME.c, NAME.d].join(), four.map((r) => r.j?.member + ":" + r.j?.public_name).join("  "));
  st.ids.member = st.ids.member || Object.fromEntries(["a", "b", "c", "d"].map((k, i) => [k, four[i].j?.member])); save();
}
const D1 = st.ids.desk;
const M = st.ids.member;

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: three spends, a deposit bound to the first, and bond credit`);
{
  const s1 = await call("b1", "a", "recused", "post_spend", [D1, P, gen(6), DESC_GULL, 5, 180]);
  const s2 = await call("b2", "d", "recused", "post_spend", [D1, Q, gen(2), DESC_PELICAN, 5, 20]);
  const s3 = await call("b3", "d", "recused", "post_spend", [D1, low("a"), gen(1), DESC_REPAY, 5, 20]);
  ok("S1 pays Gull Catering 6 GEN for refreshments, S2 pays Pelican Press 2 GEN, S3 pays A's own address 1 GEN", [s1, s2, s3].every((r) => r.j?.ok === true) && s3.j?.committed === gen(9), [s1, s2, s3].map((r) => r.j?.spend + ":" + r.j?.amount).join(" "));
  st.ids.s1 = st.ids.s1 || String(s1.j?.spend || "").slice(1);
  st.ids.s2 = st.ids.s2 || String(s2.j?.spend || "").slice(1);
  st.ids.s3 = st.ids.s3 || String(s3.j?.spend || "").slice(1);
  save();
  const doc = await seen("docS1", "recused", "document", [D1, st.ids.s1]);
  const dep = await call("b4", "d", "fixture", "deposit", [D1, st.ids.s1, P, doc.digest], { value: GEN, watch: { d: acct.d.address }, expect: { d: -GEN } });
  ok("D deposits 1 GEN on the Countersigned fixture, bound to S1, its payee and its document digest", dep.j?.ok === true && dep.j?.state === "held" && moved(dep, "d", -GEN), JSON.stringify(dep.j).slice(0, 120));
  st.ids.dep = st.ids.dep || String(dep.j?.deposit); save();
  const S = { s: acct.s.address };
  const credit = await call("b5", "s", "recused", "deposit", [], { value: CREDIT, watch: S, expect: { s: -CREDIT } });
  ok("S, who never enrols, deposits 0.2 GEN of bond credit", credit.j?.ok === true && credit.j?.bond_credit === String(CREDIT) && moved(credit, "s", -CREDIT), JSON.stringify(credit.j));
}
const [N1, N2, N3] = [st.ids.s1, st.ids.s2, st.ids.s3];

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: version 1 still holds, and two clear readings put S1 in its hold`);
{
  await until(D1, N3, "notice_until");
  const b2 = await call("c1", "b", "recused", "approve", [D1, N2]);
  ok("B, who part owns Pelican Press, is not read clear on the spend that pays it (interested, or unclear), and is refused with her attempt spent", b2.applied && b2.j?.ok === false && (b2.j?.verdict === "interested" || b2.j?.verdict === "unclear") && b2.j?.attempt_spent === true, `${votes(b2)} ${b2.j?.verdict} value ${b2.j?.value}`);
  const a3 = await call("c2", "a", "recused", "approve", [D1, N3]);
  ok("A's countersignature on a spend that pays A's own address is declared, with no model asked", a3.j?.ok === false && a3.j?.verdict === "declared" && a3.j?.model_asked === false && a3.j?.value === "--", `${votes(a3)} ${a3.j?.verdict}`);
  const b1 = await call("c3", "b", "recused", "approve", [D1, N1], { watch: { P }, expect: { P: 0n } });
  ok("B reads clear on S1, because her disclosure names Pelican Press and nothing about Gull Catering: 1 of 2", b1.applied && b1.j?.value === "UU" && b1.j?.counted === "1 of 2", `${votes(b1)} value ${b1.j?.value}`);
  const c1 = await call("c4", "c", "recused", "approve", [D1, N1], { watch: { P }, expect: { P: 0n } });
  ok(`C reads clear on S1: 2 of 2, and S1 goes into its hold of ${HOLD_MIN} minutes`, c1.applied && c1.j?.value === "UU" && c1.j?.counted === "2 of 2" && c1.j?.state === "holding" && Number(c1.j?.hold_until) - Number(c1.j?.held_at) === HOLD_MIN * 60, `${votes(c1)} value ${c1.j?.value} hold_until ${c1.j?.hold_until}`);
  ok("and nothing has reached Gull Catering", c1.j?.paid === "0" && moved(c1, "P", 0n) && moved(b1, "P", 0n), `${c1.delta.P} atto`);
  const early = await call("c5", "s", "recused", "release", [D1, N1]);
  ok("release before the hold has ended is refused", refused(early, "until then anyone may cite a page"), early.msg.slice(0, 100));
  const fix = await call("c6", "s", "fixture", "release", [st.ids.dep]);
  ok("and the fixture will not settle a spend in its hold: call again later", refused(fix, "is holding") && fix.msg.includes("call again later"), fix.msg.slice(0, 100));
}

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: a public register page, read on the live web by every validator`);
{
  const outside = await call("d1", "s", "recused", "challenge", [D1, N1, M.b, OUTSIDE]);
  ok("a challenge citing a page outside the desk's register is refused before any page is fetched", refused(outside, "not below one of the registers"), outside.msg.slice(0, 110));
  await roomInHold("d2", D1, N1);
  const clean = await call("d2", "s", "recused", "challenge", [D1, N1, M.b, PAGE.pelican], { watch: { s: acct.s.address, b: acct.b.address }, expect: { s: 0n, b: BOND } });
  ok("S cites pelican-press-ltd.html against B: it names Mara Quist, but only for the print shop her disclosure names, and says nothing about Gull Catering: clean", clean.applied && clean.j?.verdict === "clean" && clean.j?.bond_to === low("b") && /^[0-9a-f]{16}$/.test(String(clean.j?.fp)), `${votes(clean)}  ${JSON.stringify({ verdict: clean.j?.verdict, fp: clean.j?.fp })}`);
  ok("and the 0.05 GEN bond reached B from that transaction, out of S's credit", moved(clean, "b", BOND) && clean.j?.bond_credit === String(CREDIT - BOND), `${clean.delta.b} atto`);
  if (clean.j?.fp) note(`the stored fingerprint ${clean.j.fp}; this checkout's page, read as its source, gives ${fpOf(LOCAL.pelican)}`);
  await roomInHold("d3", D1, N1);
  const hidden = await call("d3", "s", "recused", "challenge", [D1, N1, M.b, PAGE.gull], { watch: { s: acct.s.address, P }, expect: { s: BOUNTY, P: 0n } });
  ok("S cites gull-catering-ltd.html against B, Mara Quist, a director of Gull Catering since 2019 whose disclosure never mentions it: hidden", hidden.applied && hidden.j?.verdict === "hidden" && /^[0-9a-f]{16}$/.test(String(hidden.j?.fp)) && hidden.j?.fp !== clean.j?.fp, `${votes(hidden)}  ${JSON.stringify({ verdict: hidden.j?.verdict, fp: hidden.j?.fp })}`);
  if (hidden.j?.fp) note(`the stored fingerprint ${hidden.j.fp}; this checkout's page, read as its source, gives ${fpOf(LOCAL.gull)}`);
  ok("B's signature is struck, the hold ends and S1 is open again, needing one more clear reading", hidden.j?.state_after === "open" && hidden.j?.approvals === 1, JSON.stringify({ state_after: hidden.j?.state_after, approvals: hidden.j?.approvals }));
  ok("B's whole stake is slashed: 0.25 GEN reached S from that transaction, and the bond stayed in S's credit", hidden.j?.slashed === STAKE_S && hidden.j?.bounty === String(BOUNTY) && moved(hidden, "s", BOUNTY) && hidden.j?.bond_credit === String(CREDIT - BOND), `${hidden.delta.s} atto`);
  const desk = await seen("deskD", "recused", "desk", [D1]);
  ok("and the other 0.25 GEN went into the desk", hidden.j?.to_desk === String(STAKE - BOUNTY) && desk.pot === String(POT + STAKE - BOUNTY) && desk.slashed_in === String(STAKE - BOUNTY) && desk.staked === String(3n * STAKE), JSON.stringify({ pot: desk.pot, staked: desk.staked, slashed_in: desk.slashed_in }));
  const mb = await seen("memberB", "recused", "member", [D1, low("b")]);
  ok("B's public record: one challenge not borne out, one signature struck, and a stake that is no longer whole", mb.hidden === 1 && mb.cleared === 1 && mb.stake === "0" && mb.stake_whole === false && mb.holds_open === 0, JSON.stringify({ hidden: mb.hidden, cleared: mb.cleared, stake: mb.stake }));
}

// ================================================================ phase E
console.log(`\n[${stamp()}] ---- phase E: a second hold, a page that names nobody on it, the release, and every route out`);
{
  const d1 = await call("e1", "d", "recused", "approve", [D1, N1], { watch: { P }, expect: { P: 0n } });
  ok("D reads clear on S1: 2 of 2 again, and S1 is in its hold a second time", d1.applied && d1.j?.value === "UU" && d1.j?.counted === "2 of 2" && d1.j?.state === "holding" && moved(d1, "P", 0n), `${votes(d1)} value ${d1.j?.value}`);
  await roomInHold("e2", D1, N1);
  const none = await call("e2", "s", "recused", "challenge", [D1, N1, M.c, PAGE.gull], { watch: { s: acct.s.address, c: acct.c.address }, expect: { s: 0n, c: 0n } });
  ok("S cites gull-catering-ltd.html against C, Tomas Brandt, whose name is not on it: unclear, and the bond stays in S's credit", none.applied && none.j?.verdict === "unclear" && none.j?.bond_to === low("s") && none.j?.bond_credit === String(CREDIT - BOND) && moved(none, "c", 0n) && moved(none, "s", 0n), `${votes(none)}  ${JSON.stringify({ verdict: none.j?.verdict, fp: none.j?.fp })}`);
  ok("a page that never names a member can neither strike that member nor pay them a bond: S1 is still in its hold", none.j?.state_after === "holding" && none.j?.slashed === "0", JSON.stringify({ state_after: none.j?.state_after }));
  const again = await call("e3", "s", "recused", "challenge", [D1, N1, M.c, PAGE.gull]);
  ok("the same page cited against C again is refused: each page is read once against each signature", refused(again, "already read against the signature of " + M.c), again.msg.slice(0, 110));
  await untilHold(D1, N1);
  const rel = await call("e4", "s", "recused", "release", [D1, N1], { watch: { P }, expect: { P: 6n * GEN } });
  ok("once the hold has run out S, who signed nothing, releases S1, and Gull Catering is paid 6 GEN in that transaction", rel.j?.ok === true && rel.j?.paid === gen(6) && rel.j?.to === P && moved(rel, "P", 6n * GEN), `${rel.delta.P} atto`);
  const fx = await call("e5", "s", "fixture", "release", [st.ids.dep], { watch: { P }, expect: { P: GEN } });
  ok("the Countersigned fixture pays its 1 GEN deposit on S1 to Gull Catering: paid, with two counted readings, UU and unstruck", fx.j?.state === "released" && fx.j?.to === P && moved(fx, "P", GEN), JSON.stringify(fx.j).slice(0, 140));
  const re = await call("e6", "b", "recused", "restake", [D1], { value: STAKE, watch: { b: acct.b.address }, expect: { b: -STAKE } });
  ok("B restakes the 0.5 GEN that was slashed, and may countersign again", re.j?.ok === true && re.j?.stake === STAKE_S && re.j?.whole === true && moved(re, "b", -STAKE), JSON.stringify(re.j));
  const ret = await call("e7", "a", "recused", "retire", [D1]);
  const back = await call("e8", "a", "recused", "withdraw_stake", [D1], { watch: { a: acct.a.address }, expect: { a: STAKE } });
  ok("A retires from countersigning and takes its 0.5 GEN stake back", ret.j?.retired === true && back.j?.withdrawn === STAKE_S && moved(back, "a", STAKE), JSON.stringify(back.j));
  const wd = await call("e9", "s", "recused", "withdraw", [], { watch: { s: acct.s.address }, expect: { s: CREDIT - BOND } });
  ok("S takes back its bond credit: 0.15 GEN, the 0.2 it put in less the bond paid to B", wd.j?.withdrawn === String(CREDIT - BOND) && moved(wd, "s", CREDIT - BOND), JSON.stringify(wd.j));
  await until(D1, N2, "window_until");
  await until(D1, N3, "window_until");
  const x2 = await call("e10", "s", "recused", "expire", [D1, N2]);
  const x3 = await call("e11", "s", "recused", "expire", [D1, N3]);
  ok("S2 and S3 expire, and no money leaves the desk", x2.j?.state === "expired" && x3.j?.state === "expired", `${x2.j?.state} ${x3.j?.state}`);
}

// ================================================================ phase F
console.log(`\n[${stamp()}] ---- phase F: what is on the chain, read back`);
{
  st.code = st.code || {};
  for (const [name, target, path] of [["recused.py", "recused", "../../contracts/recused.py"], ["countersigned.py", "fixture", "../../contracts/fixtures/countersigned.py"]]) {
    const file = readFileSync(new URL(path, import.meta.url));
    const chain = Buffer.from(String(await rpc("gen_getContractCode", [st[target]])), "base64");
    st.code[name] = { address: st[target], bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
    save();
    ok(`the code deployed at ${st[target]} is byte for byte contracts/${name === "recused.py" ? "" : "fixtures/"}${name}`, st.code[name].identical, `${chain.length} bytes, sha256 ${st.code[name].sha256}`);
  }
  const get = (id, target, fn, args = []) => seen("F_" + id, target, fn, args);
  const s1 = await get("spend1", "recused", "spend", [D1, N1]);
  ok("spend(S1): paid after two holds, one signature struck, three challenges read, counted readings C and D both UU and unstruck", s1.state === "paid" && s1.holds === 2 && s1.struck === 1 && s1.challenges === 3 && s1.approver1 === low("c") && s1.approver2 === low("d") && s1.approver1_value === "UU" && s1.approver2_value === "UU" && s1.approver1_struck === false && s1.approver2_struck === false, JSON.stringify({ state: s1.state, holds: s1.holds, struck: s1.struck }));
  const ch = await get("challenges", "recused", "challenges_of", [D1, N1, "0", "20"]);
  ok("challenges_of(S1): clean against B on the Pelican Press page, hidden against B and unclear against C on the Gull Catering page, which kept one fingerprint", ch.count === 3 && ch.rows.map((r) => r.member + ":" + r.verdict).join() === [M.b + ":clean", M.b + ":hidden", M.c + ":unclear"].join() && ch.rows.map((r) => r.url).join() === [PAGE.pelican, PAGE.gull, PAGE.gull].join() && ch.rows.every((r) => r.challenger === low("s") && r.repeat_of === 0) && ch.rows[1].fp === ch.rows[2].fp && ch.rows[0].fp !== ch.rows[1].fp, ch.rows?.map((r) => r.member + ":" + r.verdict + ":" + r.fp).join(" "));
  const rb = await get("readingB", "recused", "reading", [D1, N1, low("b")]);
  ok("reading(S1, B): kept for the record, marked struck by challenge 2", rb.ok === true && rb.struck === true && rb.struck_by === "challenge 2" && rb.value === "UU", JSON.stringify({ struck: rb.struck, struck_by: rb.struck_by }));
  const mb = await get("memberB", "recused", "member", [D1, low("b")]);
  const mc = await get("memberC", "recused", "member", [D1, low("c")]);
  const ma = await get("memberA", "recused", "member", [D1, low("a")]);
  ok("member records: B one signature struck, one challenge not borne out, and restaked; C neither; A retired with no stake", mb.hidden === 1 && mb.cleared === 1 && mb.stake === STAKE_S && mb.stake_whole === true && mc.cleared === 0 && mc.hidden === 0 && ma.retired === true && ma.stake === "0" && [ma, mb, mc].every((m) => m.holds_open === 0 && m.signed_open === 0), JSON.stringify({ B: [mb.hidden, mb.cleared, mb.stake], C: [mc.hidden, mc.cleared], A: [ma.retired, ma.stake] }));
  const desk = await get("desk", "recused", "desk", [D1]);
  ok("desk(D1): 14.25 GEN in the pot, 1.5 GEN staked, nothing committed, one spend paid and two expired", desk.pot === String(POT - 6n * GEN + STAKE - BOUNTY) && desk.staked === String(3n * STAKE) && desk.committed === "0" && desk.paid === 1 && desk.expired === 2 && desk.holding === 0 && desk.challenges === 3 && desk.hidden === 1 && desk.cleared === 1 && desk.unclear === 1 && desk.slashed_in === String(STAKE - BOUNTY), JSON.stringify({ pot: desk.pot, staked: desk.staked, committed: desk.committed }));
  const stats = await get("stats", "recused", "stats", []);
  ok("stats(): three challenges read, one hidden, one cleared, one unclear, one release, 0.25 GEN of bounty, 0.05 GEN of bond to a member, no credit left", stats.challenges === 3 && stats.hidden === 1 && stats.cleared === 1 && stats.unclear === 1 && stats.released === 1 && stats.bounties_paid === String(BOUNTY) && stats.bonds_to_members === String(BOND) && stats.bond_credit === "0", JSON.stringify(stats));
  const rule = await get("rule", "recused", "rule", []);
  ok("rule(): the register round in words, with both questions, the combine rule and the money table", typeof rule.register?.questions?.SHOWS === "string" && String(rule.register?.questions?.SILENT).includes("If the page does not give that name at all, answer no.") && String(rule.register?.combine).includes("hidden only when") && ["hidden", "clean", "unclear", "repeat"].every((k) => k in (rule.register?.money || {})), Object.keys(rule.register || {}).join(","));
  const terms = await get("terms", "fixture", "terms", []);
  const held = await get("held", "fixture", "held", [st.ids.dep]);
  ok("the fixture: bound to this register, one deposit, released", String(terms.register) === String(st.recused).toLowerCase() && terms.deposits === 1 && held.state === "released", JSON.stringify({ deposits: terms.deposits, state: held.state }));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.endPayees = { P: String(await balance(P)), Q: String(await balance(Q)) };
  st.endContracts = { recused: String(await balance(st.recused)), fixture: String(await balance(st.fixture)) };
  st.ended = new Date().toISOString();
  save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const want = { a: -POT, b: -2n * STAKE + BOND, c: -STAKE, d: -STAKE - GEN, s: BOUNTY - BOND };
  ok("every account ends where the money table says: A -20, B -0.95, C -0.5, D -1.5, S +0.2 GEN", Object.entries(want).every(([k, v]) => net(k) === v), Object.keys(want).map((k) => k.toUpperCase() + " " + net(k)).join("  "));
  ok("Gull Catering holds 7 GEN, Pelican Press nothing, and the register holds the pot and the stakes: 15.75 GEN", BigInt(st.endPayees.P) - BigInt(st.startPayees.P) === 7n * GEN && BigInt(st.endPayees.Q) === BigInt(st.startPayees.Q) && BigInt(st.endContracts.recused) === POT - 6n * GEN + STAKE - BOUNTY + 3n * STAKE && BigInt(st.endContracts.fixture) === 0n, JSON.stringify({ ...st.endPayees, ...st.endContracts }));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log("Recused:", st.recused, "- Countersigned:", st.fixture, "- register pages at", REGISTRY);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id], j = jsonOf(s.tries.at(-1).msg); if (j?.verdict) console.log(`${id.padEnd(6)} ${s.tries.map((t) => t.tx + " " + tally(t.votes)).join(" | ")}  ${j.verdict} ${j.value || j.fp || ""}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
