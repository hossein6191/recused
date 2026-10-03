/* Recused against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copies.
 *
 *   npm ci                                        # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   PHASE=P node tests/on_chain/smoke.mjs         # the probe: one spend, three readings, on a throwaway copy
 *   node tests/on_chain/smoke.mjs                 # the whole run, phases A to I, about an hour and a half
 *   RESUME=1 node tests/on_chain/smoke.mjs        # continue a run that was cut off, from the saved state
 *
 * Four accounts play the whole story on desk D1: A opens the desk and keeps the residents
 * association's minutes, B part owns the print shop, C chairs the bike group, D teaches at the
 * school. Three more addresses are payees and never sign: P the print shop, K the bike group, H
 * the hall. One step cannot be played by four: a spend takes four identifications and counts a
 * fifth member turned away, and its poster may not identify, so that takes six members. Phase G
 * opens a second desk for it and brings in two more accounts, E and F, for that step alone.
 *
 * Phases:
 *   P  (only with PHASE=P) the probe. A throwaway copy, one desk, one spend that pays a print shop, and
 *      three readings of it: the member who part owns the shop, the member who teaches at a school and
 *      the member who chairs a bike group. It measures the one sentence of the prompt everything leans
 *      on: that the branch where the spend is NOT carried out is read against the position as it
 *      stands. An honest bystander must read UU, not UL.
 *   A  deploy; a desk name that is too short and a minimum notice below the floor are refused and the
 *      value comes back; desk D1 is opened with 500 GEN, open enrolment and a minimum notice of five
 *      minutes; money sent to a desk that does not exist comes back; four members enrol; an entry
 *      that names nothing is refused.
 *   B  S1 is posted to the print shop by the bike group's chair. Inside its notice window a
 *      countersignature is refused and stored, one member says who the payee is, and its poster may
 *      not. S2 and S3 are posted to the bike group by the opener, who may then hold no third, and what
 *      was said about the payee of S2 is carried onto S3.
 *   C  after the notice window: the part owner of the print shop is read interested on S1 and
 *      refused; two other members are read clear and the second one pays the print shop in that same
 *      transaction; S2 is carried the same way; S3 is left standing on one clear reading.
 *   D  a second funder arrives after the payments; a member amends, adding one vague entry, and a
 *      fourth spend is posted. While its notice window runs, four refusals that ask no model are made
 *      on S3: the same member again, a declared payee, the poster, and a disclosure newer than the
 *      spend.
 *   E  after S4's notice window the member who amended is read unclear on it. Then the same payment
 *      is posted again as S5, after another member has amended: the reading that was not clear
 *      stands, and the amended disclosure is late for it, both with no model asked.
 *   F  the Countersigned fixture: a deposit bound to S2 is released to its payee, a second release
 *      raises, a deposit bound to the wrong payee goes back, and a deposit on the open S3 waits.
 *   G  the second desk, with six members: four say who the payee is, the fifth is turned away and
 *      counted, and one reading is made of the document that says so.
 *   H  the windows end: S4, S5 and S3 are expired by members who did not post them, a second expiry
 *      raises, a funder who leaves while S3 is open holds a claim on it and is paid it back when S3
 *      expires, the second funder takes back what they put in, the fixture returns the deposit on
 *      the expired spend, and a deposit on a spend that never existed is cancelled.
 *   I  the deployed code is read back and compared with these files byte for byte, and the views are
 *      read and checked against what the run did.
 *
 * Every refusal is a signed transaction. Payments are read from balances after finalisation.
 * Transactions are polled with eth_getTransactionByHash (300 a minute), never with views
 * (gen_call is limited to 30 a minute per client, shared with sim_fundAccount). A round the
 * validators do not carry stores nothing; it is sent again and both transactions are kept.
 * Every step is saved as it is made, so a run that is cut off continues without sending twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const PHASE = (process.env.PHASE || "ALL").toUpperCase();
const PROBE = PHASE === "P";
const STATE = process.env.STATE || join(tmpdir(), PROBE ? "recused-probe-state.json" : "recused-smoke-state.json");
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

// ---------- state: accounts, addresses and every step already made survive a cut-off run ----------
const st = existsSync(STATE) && (process.env.RESUME || PROBE) && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || [];
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { a: "opens the desk, keeps the minutes", b: "part owns the print shop", c: "chairs the bike group", d: "teaches at the school", e: "a fifth member, phase G only", f: "a sixth member, phase G only" };
for (const k of ["a", "b", "c", "d", "e", "f", "p", "k", "h"]) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
const P = createAccount(st.keys.p).address.toLowerCase();   // the print shop's address; it never signs anything
const K = createAccount(st.keys.k).address.toLowerCase();   // the bike group's address
const H = createAccount(st.keys.h).address.toLowerCase();   // the hall's address
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, acct[k].address]));
st.payees = { P, K, H };
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

// ---------- the demonstration text ----------
const entries = (list) => JSON.stringify(list.map(([name, relation, detail]) => ({ name, relation, detail })));
const ST_A = "I keep the minutes of the Pelican Street Residents Association and run no business of my own.";
const EN_A = entries([["Pelican Street Residents Association", "member_of", "I keep its minutes; it holds no money and sells nothing."]]);
const ST_B = "I co-own Pelican Press, a two-person print shop on the same street, with my sister.";
const PRESS = ["Pelican Press", "part_owns", "A two-person print shop at the end of the street; my sister owns the other half."];
const EN_B = entries([PRESS]);
const EN_B2 = entries([PRESS, ["Pelican Street allotments", "tenant_of", "I rent one plot there."]]);
const ST_C = "I chair the tenants' bike group, which keeps its own small kitty and asks this fund for lock money most years.";
const EN_C = entries([["Pelican Street tenants' bike group", "officer_of", "I chair it; it has its own kitty and asks this fund for lock money."]]);
const ST_D = "I teach at the local school and have no business interests of any kind.";
const SCHOOL = ["Hillside Primary School", "employed_by", "I teach there; the school buys nothing from this fund and sells it nothing."];
const EN_D = entries([SCHOOL]);
const VAGUE = ["the market", "other", "I do some business there most weeks."];
const EN_D2 = entries([SCHOOL, VAGUE]);
const ST_E = "I am retired and keep the seed store of the Pelican Street allotment society.";
const EN_E = entries([["Pelican Street allotment society", "volunteers_for", "I keep its seed store; it buys nothing from this fund."]]);
const ST_F = "I drive a delivery van for a bakery in the next town and have no other interests.";
const EN_F = entries([["Marlow Road Bakery", "employed_by", "I drive its delivery van; it is in the next town."]]);
const DESC_PRINT = "Print 500 copies of the annual report";
const DESC_LOCKS = "Buy twenty locks for the tenants' bike group shelter";
const DESC_BOARD = "Replace the noticeboard in the bike shelter";
const DESC_HALL = "Pay the hall hire for the annual meeting";
const DESC_POSTERS = "Print 200 posters for the summer fair";
const DESC_FLYERS = "Print 100 flyers for the street party";
const IDENT = "The payee address is Pelican Press, the print shop at the end of Pelican Street.";
const IDENT_KITTY = "The payee address is the tenants' bike group's own kitty.";
const LABEL = "Pelican Street mutual fund";
const LABEL2 = "Pelican Street party desk";

if (PROBE) {
  console.log(`\n[${stamp()}] ---- the probe: how the branch where the spend is NOT carried out is read`);
  await fundOnce("a", 60); for (const k of ["b", "c", "d"]) await fundOnce(k, 5);
  st.recused = st.recused || await deploy("probe", "a", "../../contracts/recused.py", []);
  save();
  await call("open", "a", "recused", "open_desk", ["Pelican Street probe desk", "", 5], { value: 10n * GEN });
  await call("enrolA", "a", "recused", "enrol", ["D1", ST_A, EN_A, ""]);
  await call("enrolB", "b", "recused", "enrol", ["D1", ST_B, EN_B, ""]);
  await call("enrolC", "c", "recused", "enrol", ["D1", ST_C, EN_C, ""]);
  await call("enrolD", "d", "recused", "enrol", ["D1", ST_D, EN_D, ""]);
  const s1 = await call("post", "a", "recused", "post_spend", ["D1", P, gen(2), DESC_PRINT, 5, 60]);
  ok("the probe spend is posted", s1.j?.ok === true, s1.msg.slice(0, 90));
  const id = await call("identify", "d", "recused", "identify", ["D1", "1", IDENT]);
  ok("and a member who is not its poster says who the payee is", id.j?.ok === true, id.msg.slice(0, 90));
  await until("D1", 1, "notice_until");
  const doc = await seen("doc", "recused", "document", ["D1", "1"]);
  console.log("      the judged document:\n" + String(doc.document).split("\n").map((l) => "        " + l).join("\n"));
  const b = await call("probeB", "b", "recused", "approve", ["D1", "1"]);
  ok("the part owner of the payee is read as gaining if the spend is carried out", b.j?.ifdone === "G", `${votes(b)} value ${b.j?.value}`);
  ok("and as unmoved if it is not: the NOT branch is read against the position as it stands", b.j?.ifnot === "U", `value ${b.j?.value} (UL here would mean the branch was read comparatively)`);
  const d = await call("probeD", "d", "recused", "approve", ["D1", "1"]);
  ok("a teacher at a school that sells the fund nothing is read UU", d.j?.value === "UU", `${votes(d)} value ${d.j?.value}`);
  const c = await call("probeC", "c", "recused", "approve", ["D1", "1"]);
  ok("the chair of a bike group is read UU on a printing spend", c.j?.value === "UU", `${votes(c)} value ${c.j?.value}`);
  console.log(`\nprobe: B ${b.j?.value}  D ${d.j?.value}  C ${c.j?.value}   contract ${st.recused}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

await fundOnce("a", 620); await fundOnce("b", 40); await fundOnce("c", 60); await fundOnce("d", 300);
if (!st.start) { st.start = {}; for (const k of ["a", "b", "c", "d"]) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] A ${acct.a.address}  ${ROLES.a}\n           B ${acct.b.address}  ${ROLES.b}\n           C ${acct.c.address}  ${ROLES.c}\n           D ${acct.d.address}  ${ROLES.d}\n           payees, which never sign: print shop ${P}  bike group ${K}  hall ${H}\n           state ${STATE}`);
const POT = 500n * GEN;

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, open the desk, enrol`);
st.recused = st.recused || await deploy("deploy", "a", "../../contracts/recused.py", []);
save();
console.log(`      Recused at ${st.recused}`);
{
  const A = { a: acct.a.address }, B = { b: acct.b.address };
  const short = await call("a1", "a", "recused", "open_desk", ["no", "", 5], { value: 3n * GEN, watch: A, expect: { a: 0n } });
  ok("a desk name that is too short is refused, stored on the open ring and not raised", short.exec !== "ERROR" && short.j?.ok === false && short.j?.recorded === true && short.j?.ring === "open", short.j?.reason);
  ok("and the 3 GEN sent with it comes back", short.j?.returned === gen(3) && moved(short, "a", 0n), `${short.delta.a} atto net`);
  const brief = await call("a2", "a", "recused", "open_desk", [LABEL, "", 4], { value: 3n * GEN, watch: A, expect: { a: 0n } });
  ok("a desk whose minimum notice is under five minutes is refused and the value comes back", brief.j?.ok === false && String(brief.j?.reason).includes("minimum notice is 5 to 1440") && brief.j?.returned === gen(3) && moved(brief, "a", 0n), brief.j?.reason?.slice(0, 70));
  const o = await call("a3", "a", "recused", "open_desk", [LABEL, "", 5], { value: POT, watch: A, expect: { a: -POT } });
  ok("the desk is opened with 500 GEN, open enrolment and a minimum notice of five minutes", o.j?.ok === true && o.j?.desk === "D1" && o.j?.open_enrolment === true && o.j?.pot === String(POT) && o.j?.min_notice_minutes === 5 && o.j?.seq === 1 && moved(o, "a", -POT), JSON.stringify(o.j).slice(0, 120));
  const lost = await call("a4", "b", "recused", "fund", ["D7"], { value: 2n * GEN, watch: B, expect: { b: 0n } });
  ok("money sent to a desk that does not exist is refused and comes back", lost.j?.ok === false && lost.j?.reason === "no desk D7" && lost.j?.returned === gen(2) && lost.j?.ring === "open" && moved(lost, "b", 0n), lost.j?.reason);
  const ea = await call("a5", "a", "recused", "enrol", ["D1", ST_A, EN_A, ""]);
  const eb = await call("a6", "b", "recused", "enrol", ["D1", ST_B, EN_B, ""]);
  const ec = await call("a7", "c", "recused", "enrol", ["D1", ST_C, EN_C, K]);
  const out = await call("a8", "d", "recused", "approve", ["D1", "1"]);
  ok("a countersignature from an address that holds no disclosure is stored on the open ring, not the desk's", out.exec !== "ERROR" && out.j?.ok === false && out.j?.ring === "open" && out.j?.desk === "D1" && out.j?.attempt_spent === false, out.j?.reason);
  const vague = await call("a9", "d", "recused", "enrol", ["D1", "I have various business interests around the town and beyond.", entries([["various business interests", "owns", ""]]), ""]);
  ok("an entry name made only of placeholder words is refused at the door", refused(vague, "a fixed list this contract holds"), vague.msg.slice(0, 80));
  const ed = await call("a10", "d", "recused", "enrol", ["D1", ST_D, EN_D, ""]);
  const four = [ea, eb, ec, ed];
  ok("four members enrol, each under their own address", four.every((r) => r.j?.ok === true) && four.map((r) => r.j?.member).join() === "M1,M2,M3,M4" && four.map((r) => r.j?.who).join() === ["a", "b", "c", "d"].map(low).join(), four.map((r) => r.j?.member + "@" + r.j?.filed_seq).join(" "));
  ok("the bike group's chair declared its address", JSON.stringify(ec.j?.declared) === JSON.stringify([K]), JSON.stringify(ec.j?.declared));
  const twice = await call("a11", "b", "recused", "enrol", ["D1", ST_B + " And nothing else.", EN_B, ""]);
  ok("an address enrols once", refused(twice, "already has a disclosure"), twice.msg.slice(0, 70));
}

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: three spends, and who the payee is`);
{
  // The two calls that need S1's notice window open are made straight after it is posted: five minutes is short.
  const s1 = await call("b1", "c", "recused", "post_spend", ["D1", P, gen(180), DESC_PRINT, 5, 90]);
  const early = await call("b2", "b", "recused", "approve", ["D1", "1"]);
  ok("nobody countersigns during the notice window; the refusal is stored on the desk's ring and the attempt unspent", early.exec !== "ERROR" && early.j?.ok === false && early.j?.kind === "procedural" && early.j?.attempt_spent === false && early.j?.ring === "D1" && String(early.j?.reason).includes("the notice window of S1 runs to"), early.j?.reason?.slice(0, 80));
  const id = await call("b3", "d", "recused", "identify", ["D1", "1", IDENT]);
  ok("a member who is not the poster says who the payee of S1 is", id.j?.ok === true && id.j?.member === "M4", JSON.stringify(id.j).slice(0, 100));
  const mine = await call("b4", "c", "recused", "identify", ["D1", "1", "The payee is a printer the poster has used before."]);
  ok("and the poster of S1, who has the description to say it in, may not", refused(mine, "another member's word"), mine.msg.slice(0, 80));
  const s2 = await call("b5", "a", "recused", "post_spend", ["D1", K, gen(60), DESC_LOCKS, 5, 90]);
  const kit = await call("b6", "c", "recused", "identify", ["D1", "2", IDENT_KITTY]);
  ok("the bike group's chair says who the payee of S2 is", kit.j?.ok === true && kit.j?.member === "M3" && kit.j?.n === 1, JSON.stringify(kit.j).slice(0, 100));
  const s3 = await call("b7", "a", "recused", "post_spend", ["D1", K, gen(40), DESC_BOARD, 5, 75]);
  ok("three spends are posted and their amounts committed", [s1, s2, s3].every((r) => r.j?.ok === true) && s3.j?.committed === gen(280), [s1, s2, s3].map((r) => r.j?.spend + "@" + r.j?.posted_seq).join(" "));
  ok("S3 pays the same address as S2, so it joins that run: the gate of S2, and what was said about the payee carried onto it", s3.j?.run === 1 && s3.j?.run_first === "S2" && s3.j?.gate_seq === s2.j?.posted_seq && s3.j?.gate_seq < s3.j?.posted_seq && s3.j?.identifications_carried === 1, JSON.stringify({ gate_seq: s3.j?.gate_seq, posted_seq: s3.j?.posted_seq, carried: s3.j?.identifications_carried }));
  const third = await call("b8", "a", "recused", "post_spend", ["D1", H, gen(1), "Buy tea for the annual meeting", 5, 90]);
  ok("a member who has two spends of their own open may not post a third", refused(third, "the most one poster may hold"), third.msg.slice(0, 90));
  const self = await call("b9", "b", "recused", "post_spend", ["D1", acct.b.address, gen(1), "Repay the poster for the tea urn", 5, 90]);
  ok("a member may not post a spend that pays their own address", refused(self, "needs no reading at all"), self.msg.slice(0, 70));
  const itself = await call("b10", "b", "recused", "post_spend", ["D1", st.recused, gen(1), "Top up the desk's own contract", 5, 90]);
  ok("the payee may not be the desk contract itself", refused(itself, "the desk contract itself"), itself.msg.slice(0, 70));
  const over = await call("b11", "b", "recused", "post_spend", ["D1", H, gen(300), DESC_HALL, 5, 90]);
  ok("a spend may not commit more than the desk has free", refused(over, "is free and this spend asks"), over.msg.slice(0, 90));
  const brief = await call("b12", "b", "recused", "post_spend", ["D1", H, gen(1), DESC_HALL, 4, 90]);
  ok("a spend may not give less notice than the desk was opened with", refused(brief, "fixed when the desk was opened"), brief.msg.slice(0, 90));
}

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: the readings`);
{
  await until("D1", 3, "notice_until");
  const doc = await seen("docS1", "recused", "document", ["D1", "1"]);
  console.log("      the judged document of S1:\n" + String(doc.document).split("\n").map((l) => "        " + l).join("\n"));
  const late = await call("c0", "a", "recused", "identify", ["D1", "1", "The payee is the print shop on the corner."]);
  ok("the document is sealed: no identification once approvals are open", refused(late, "sealed"), late.msg.slice(0, 80));

  const b1 = await call("c1", "b", "recused", "approve", ["D1", "1"], { watch: { P } });
  ok("the part owner of the print shop is read interested on S1 and refused", b1.applied && b1.j?.ok === false && b1.j?.verdict === "interested", `${votes(b1)} value ${b1.j?.value}`);
  ok("the recusal is a stored row with its pair and the document's digest", b1.j?.attempt_spent === true && b1.j?.doc_digest === doc.digest && b1.j?.model_asked === true, `${b1.j?.why}`);
  const own = await call("c2", "c", "recused", "approve", ["D1", "1"]);
  ok("the member who posted S1 may never countersign it", own.j?.ok === false && String(own.j?.reason).includes("may never countersign") && own.j?.attempt_spent === false, own.j?.reason);
  ok("and the attempt is counted on the spend itself", (await seen("spendS1", "recused", "spend", ["D1", "1"])).poster_tried === 1);
  const a1 = await call("c3", "a", "recused", "approve", ["D1", "1"], { watch: { P }, expect: { P: 0n } });
  ok("the keeper of the residents association's minutes is read clear on S1: 1 of 2", a1.applied && a1.j?.value === "UU" && a1.j?.counted === "1 of 2", `${votes(a1)} value ${a1.j?.value}`);
  ok("and nothing has reached the print shop yet", moved(a1, "P", 0n) && moved(b1, "P", 0n));
  const d1 = await call("c4", "d", "recused", "approve", ["D1", "1"], { watch: { P }, expect: { P: 180n * GEN } });
  ok("the teacher is read clear on S1: 2 of 2", d1.applied && d1.j?.value === "UU" && d1.j?.counted === "2 of 2" && d1.j?.paid === gen(180) && d1.j?.state === "paid", `${votes(d1)} value ${d1.j?.value}`);
  ok("and 180 GEN reached the print shop from that transaction", moved(d1, "P", 180n * GEN), `${d1.delta.P} atto`);

  const b2 = await call("c5", "b", "recused", "approve", ["D1", "2"], { watch: { K }, expect: { K: 0n } });
  ok("the same part owner is read clear on a spend for bike locks", b2.applied && b2.j?.value === "UU" && b2.j?.counted === "1 of 2", `${votes(b2)} value ${b2.j?.value}`);
  const d2 = await call("c6", "d", "recused", "approve", ["D1", "2"], { watch: { K }, expect: { K: 60n * GEN } });
  ok("the teacher is read clear on S2 and 60 GEN reaches the bike group", d2.applied && d2.j?.counted === "2 of 2" && moved(d2, "K", 60n * GEN), `${votes(d2)} value ${d2.j?.value}`);
  const b3 = await call("c7", "b", "recused", "approve", ["D1", "3"]);
  ok("S3 stands on one clear reading, made of a document that carries what was said on S2", b3.applied && b3.j?.counted === "1 of 2" && b3.j?.idents_seen === 1, `${votes(b3)} value ${b3.j?.value}`);
  const desk = await seen("deskC", "recused", "desk", ["D1"]);
  ok("the desk's books: pot 260, committed 40, drawn 240", desk.pot === gen(260) && desk.committed === gen(40) && desk.drawn === gen(240), JSON.stringify({ pot: desk.pot, committed: desk.committed, drawn: desk.drawn }));
}

// ================================================================ phase D
console.log(`\n[${stamp()}] ---- phase D: a second funder, an amendment, a fourth spend, and the refusals that ask no model`);
{
  const f = await call("d0", "d", "recused", "fund", ["D1"], { value: 260n * GEN, watch: { d: acct.d.address }, expect: { d: -260n * GEN } });
  ok("a second funder puts in 260 GEN after 240 was paid out, and is given units at the going rate", f.j?.ok === true && f.j?.units === gen(500) && f.j?.funded_total === gen(1000) && f.j?.pot === gen(520) && moved(f, "d", -260n * GEN), JSON.stringify({ units: f.j?.units, pot: f.j?.pot }));
  const am = await call("d1", "d", "recused", "amend", ["D1", ST_D, EN_D2, ""]);
  ok("the teacher amends: version 2, and a sequence number above every spend posted so far", am.j?.ok === true && am.j?.version === 2 && am.j?.entries === 2, JSON.stringify({ filed_seq: am.j?.filed_seq }));
  const noop = await call("d2", "d", "recused", "amend", ["D1", ST_D, EN_D2, ""]);
  ok("an amendment that says nothing new is refused", refused(noop, "already says"), noop.msg.slice(0, 70));
  const s4 = await call("d3", "a", "recused", "post_spend", ["D1", H, gen(30), DESC_HALL, 5, 45]);
  ok("a fourth spend is posted after the amendment", s4.j?.ok === true && s4.j?.spend === "S4" && s4.j?.posted_seq > am.j?.filed_seq && s4.j?.gate_seq === s4.j?.posted_seq, `${s4.j?.spend}@${s4.j?.posted_seq}`);

  console.log(`\n[${stamp()}]      four refusals that ask no model, on S3`);
  const again = await call("d4", "b", "recused", "approve", ["D1", "3"]);
  ok("a member who already has a reading on S3 is refused", again.j?.ok === false && String(again.j?.reason).includes("one attempt per member") && again.j?.attempt_spent === false, again.j?.reason?.slice(0, 80));
  const dec = await call("d5", "c", "recused", "approve", ["D1", "3"]);
  ok("the payee of S3 is an address the bike group's chair declared: refused, value --, no model", dec.j?.ok === false && dec.j?.verdict === "declared" && dec.j?.value === "--" && dec.j?.model_asked === false && dec.j?.doc_digest === "", dec.j?.why);
  const poster = await call("d6", "a", "recused", "approve", ["D1", "3"]);
  ok("the poster of S3 may never countersign it", poster.j?.ok === false && String(poster.j?.reason).includes("may never countersign"), poster.j?.reason);
  const lt = await call("d7", "d", "recused", "approve", ["D1", "3"]);
  ok("the teacher amended after S3 was posted: refused on sequence order, value --, no model", lt.j?.ok === false && lt.j?.verdict === "late" && lt.j?.value === "--" && lt.j?.model_asked === false && lt.j?.filed_seq > lt.j?.gate_seq, `${lt.j?.filed_seq} > ${lt.j?.gate_seq}`);
  const rows = await seen("readingsS3", "recused", "readings", ["D1", "3"]);
  ok("S3 carries three readings, clear, declared and late, and its poster's attempt is counted on it", (rows.rows || []).map((r) => r.verdict).join() === "clear,declared,late" && rows.poster_tried === 1, (rows.rows || []).map((r) => r.verdict + ":" + r.value).join(" "));
  const ring = await seen("ringD1", "recused", "refusals", ["D1"]);
  ok("the four procedural refusals of members are on the desk's ring", Array.isArray(ring) && ring.length === 4 + outages() && ring.every((r) => r.ring === "D1" && r.kind === "procedural"), `${ring.length} rows`);
  const open = await seen("ringOpen", "recused", "refusals", ["open"]);
  ok("and the four made by addresses with no standing on a desk are on the open ring", Array.isArray(open) && open.length === 4 && open.every((r) => r.ring === "open"), `${open.length} rows`);
}

// ================================================================ phase E
console.log(`\n[${stamp()}] ---- phase E: one vague entry, and the same payment posted again`);
let needInterested = false, needUnclear = false, needStanding = false;
{
  await until("D1", 4, "notice_until");
  const d4 = await call("e1", "d", "recused", "approve", ["D1", "4"]);
  ok("one vague entry makes the reading unclear: not counted, attempt spent", d4.applied && d4.j?.ok === false && d4.j?.verdict === "unclear" && d4.j?.attempt_spent === true, `${votes(d4)} value ${d4.j?.value}`);

  console.log(`\n[${stamp()}]      the same payment posted again, under a new number`);
  const amB = await call("e2", "b", "recused", "amend", ["D1", ST_B, EN_B2, ""]);
  ok("the part owner amends after S4 was posted", amB.j?.ok === true && amB.j?.version === 2, JSON.stringify({ filed_seq: amB.j?.filed_seq }));
  const s5 = await call("e3", "c", "recused", "post_spend", ["D1", H, gen(30), DESC_HALL + ", asked a second time", 5, 20]);
  ok("the hall is posted again as S5: a new number, the same run and the gate of its first posting", s5.j?.ok === true && s5.j?.spend === "S5" && s5.j?.run === 1 && s5.j?.run_first === "S4" && s5.j?.gate_seq < amB.j?.filed_seq && amB.j?.filed_seq < s5.j?.posted_seq, JSON.stringify({ gate_seq: s5.j?.gate_seq, posted_seq: s5.j?.posted_seq }));
  const word = await call("e4", "b", "recused", "identify", ["D1", "5", "The payee address is the hall on Pelican Street."]);
  ok("a member whose disclosure is newer than the gate may not say who the payee is either", refused(word, "after a spend to this payee address was first posted"), word.msg.slice(0, 90));
  await until("D1", 5, "notice_until");
  const lateB = await call("e5", "b", "recused", "approve", ["D1", "5"]);
  ok("a disclosure amended after the payee was first posted is late for S5, though S5 is newer than it: no model", lateB.j?.ok === false && lateB.j?.verdict === "late" && lateB.j?.model_asked === false && lateB.j?.gate_seq < lateB.j?.filed_seq && lateB.j?.filed_seq < lateB.j?.posted_seq, `${lateB.j?.gate_seq} < ${lateB.j?.filed_seq} < ${lateB.j?.posted_seq}`);
  const stand = await call("e6", "d", "recused", "approve", ["D1", "5"]);
  ok("the reading that was not clear on S4 stands on S5: refused, value --, no model", stand.j?.ok === false && stand.j?.verdict === "standing" && stand.j?.value === "--" && stand.j?.model_asked === false && stand.j?.stands_on === "S4" && stand.j?.stands_value === d4.j?.value, stand.j?.why);
  const s3 = await read("recused", "spend", ["D1", "3"]);
  if (st.steps.e7 || Number(s3.window_until) - Number(s3.now) > 180) {
    const tooSoon = await call("e7", "b", "recused", "expire", ["D1", "3"]);
    ok("a spend cannot be expired before its window ends", refused(tooSoon, "runs to"), tooSoon.msg.slice(0, 70));
  } else console.log("      the window of S3 has under three minutes left, so the early expiry is not tried");
  const c1 = st.steps.c1.tries.at(-1);
  needInterested = !(c1.applied && jsonOf(c1.msg)?.verdict === "interested");
  needUnclear = !(d4.applied && d4.j?.verdict === "unclear");
  needStanding = !(stand.applied && stand.j?.verdict === "standing");
}

// A reading is the network's and may come back as another word than the one this run was written
// to show. When one of the three model-made refusals is missing, the print shop is paid for a
// second job: S1 was paid, so this is a new run of that address and every member is read afresh.
if (st.steps.x1 || needInterested || needUnclear || needStanding) {
  console.log(`\n[${stamp()}] ---- a second printing job, because a reading above came back as another word`);
  const s6 = await call("x1", "c", "recused", "post_spend", ["D1", P, gen(20), DESC_POSTERS, 5, 20]);
  ok("a second job for the print shop is posted: a new run of that address", s6.j?.ok === true && s6.j?.run === 2 && s6.j?.gate_seq === s6.j?.posted_seq, JSON.stringify({ spend: s6.j?.spend, run: s6.j?.run }));
  const n6 = String(s6.j?.spend).slice(1);
  const id6 = await call("x2", "a", "recused", "identify", ["D1", n6, IDENT]);
  ok("a member says who the payee is", id6.j?.ok === true, id6.msg.slice(0, 80));
  await until("D1", n6, "notice_until");
  const b6 = await call("x3", "b", "recused", "approve", ["D1", n6]);
  ok("the part owner of the print shop is read on it, and refused", b6.applied && b6.j?.ok === false && b6.j?.model_asked === true, `${votes(b6)} value ${b6.j?.value} ${b6.j?.verdict}`);
  if (st.steps.x4 || needUnclear) {
    const d6 = await call("x4", "d", "recused", "approve", ["D1", n6]);
    ok("the member with one vague entry is read on it", d6.applied && d6.j?.model_asked === true, `${votes(d6)} value ${d6.j?.value} ${d6.j?.verdict}`);
  }
  if (st.steps.x5 || needStanding) {
    const s7 = await call("x5", "d", "recused", "post_spend", ["D1", P, gen(20), DESC_POSTERS + ", asked a second time", 5, 20]);
    const n7 = String(s7.j?.spend).slice(1);
    await until("D1", n7, "notice_until");
    const b7 = await call("x6", "b", "recused", "approve", ["D1", n7]);
    ok("the same payment posted again: the part owner's reading stands, with no model asked", b7.j?.verdict === "standing" && b7.j?.model_asked === false && b7.j?.stands_on === s6.j?.spend, b7.j?.why);
  }
}

// ================================================================ phase F
console.log(`\n[${stamp()}] ---- phase F: a second contract pays against the reading`);
{
  st.fixture = st.fixture || await deploy("deployF", "c", "../../contracts/fixtures/countersigned.py", [st.recused]);
  save();
  console.log(`      Countersigned at ${st.fixture}`);
  ok("the fixture deploys: its constructor read the register's desks() view", /^0x[0-9a-fA-F]{40}$/.test(String(st.fixture)) && st.steps.deployF.tries.at(-1).applied && st.steps.deployF.tries.at(-1).exec === "SUCCESS", votes(st.steps.deployF));
  const doc2 = await seen("docS2", "recused", "document", ["D1", "2"]);
  const doc3 = await seen("docS3", "recused", "document", ["D1", "3"]);
  const C = { c: acct.c.address };
  const dep = await call("f1", "c", "fixture", "deposit", ["D1", "2", K, doc2.sealed_digest], { value: 25n * GEN, watch: C, expect: { c: -25n * GEN } });
  ok("a deposit of 25 GEN is bound to S2, its payee and the digest of its judged document", dep.j?.ok === true && dep.j?.state === "held" && dep.j?.deposit === "1" && moved(dep, "c", -25n * GEN), JSON.stringify(dep.j).slice(0, 120));
  const live = await call("f2", "c", "fixture", "deposit", ["D1", "2", K, doc2.sealed_digest], { value: 2n * GEN, watch: C, expect: { c: 0n } });
  ok("the same address may not hold two live deposits on one spend; the value comes back", live.j?.ok === false && String(live.j?.reason).includes("already has a live deposit") && live.j?.returned === gen(2) && moved(live, "c", 0n), live.j?.reason?.slice(0, 70));
  const wrong = await call("f3", "b", "fixture", "deposit", ["D1", "2", K, "not a digest"], { value: 2n * GEN, watch: { b: acct.b.address }, expect: { b: 0n } });
  ok("a deposit with no digest is refused and returned", wrong.j?.ok === false && String(wrong.j?.reason).includes("64 hexadecimal") && wrong.j?.returned === gen(2) && moved(wrong, "b", 0n), wrong.j?.reason?.slice(0, 60));
  const rel = await call("f4", "d", "fixture", "release", ["1"], { watch: { K }, expect: { K: 25n * GEN } });
  ok("an address that is not the depositor releases it: S2 was carried with two clear readings", rel.j?.ok === true && rel.j?.state === "released" && rel.j?.to === K, JSON.stringify(rel.j).slice(0, 120));
  ok("and 25 GEN reaches the bike group from the second contract", moved(rel, "K", 25n * GEN), `${rel.delta.K} atto`);
  const twice = await call("f5", "d", "fixture", "release", ["1"]);
  ok("a second release raises", refused(twice, "already released"), twice.msg.slice(0, 60));
  const other = await call("f6", "a", "fixture", "deposit", ["D1", "2", P, doc2.sealed_digest], { value: 5n * GEN, watch: { a: acct.a.address }, expect: { a: -5n * GEN } });
  const back = await call("f7", "b", "fixture", "release", [String(other.j?.deposit)], { watch: { a: acct.a.address }, expect: { a: 5n * GEN } });
  ok("a deposit bound to S2 but to another payee is refused at release and goes back to its depositor", other.j?.ok === true && back.j?.ok === false && back.j?.state === "refused" && back.j?.to === low("a") && String(back.j?.reason).includes("not the payee this deposit was bound to") && moved(back, "a", 5n * GEN), back.j?.reason);
  const dep3 = await call("f8", "c", "fixture", "deposit", ["D1", "3", K, doc3.sealed_digest], { value: 10n * GEN, watch: C, expect: { c: -10n * GEN } });
  const open = await call("f9", "d", "fixture", "release", [String(dep3.j?.deposit)]);
  ok("a deposit on S3, which is still open, is held, and a release raises until the desk has decided", dep3.j?.ok === true && dep3.j?.state === "held" && refused(open, "still open"), open.msg.slice(0, 80));
  st.dep3 = String(dep3.j?.deposit); save();
}

// ================================================================ phase G
console.log(`\n[${stamp()}] ---- phase G: a desk of six, four places for saying who the payee is, and the member turned away`);
{
  await fundOnce("e", 5); await fundOnce("f", 5);
  console.log(`      E ${acct.e.address}  ${ROLES.e}\n      F ${acct.f.address}  ${ROLES.f}`);
  const o = await call("g1", "a", "recused", "open_desk", [LABEL2, "", 5], { value: 2n * GEN, watch: { a: acct.a.address }, expect: { a: -2n * GEN } });
  ok("a second desk is opened with 2 GEN", o.j?.ok === true && o.j?.desk === "D2" && o.j?.pot === gen(2), JSON.stringify(o.j).slice(0, 100));
  const six = [];
  six.push(await call("g2", "a", "recused", "enrol", ["D2", ST_A, EN_A, ""]));
  six.push(await call("g3", "b", "recused", "enrol", ["D2", ST_B, EN_B2, ""]));
  six.push(await call("g4", "c", "recused", "enrol", ["D2", ST_C, EN_C, K]));
  six.push(await call("g5", "d", "recused", "enrol", ["D2", ST_D, EN_D, ""]));
  six.push(await call("g6", "e", "recused", "enrol", ["D2", ST_E, EN_E, ""]));
  six.push(await call("g7", "f", "recused", "enrol", ["D2", ST_F, EN_F, ""]));
  ok("six members enrol on it", six.every((r) => r.j?.ok === true) && six.map((r) => r.j?.member).join() === "M1,M2,M3,M4,M5,M6", six.map((r) => r.j?.member + "@" + r.j?.filed_seq).join(" "));
  const s = await call("g8", "c", "recused", "post_spend", ["D2", P, gen(1), DESC_FLYERS, 8, 30]);   // eight minutes: five calls must fit inside it
  ok("a spend of 1 GEN is posted on it", s.j?.ok === true && s.j?.spend === "S1" && s.j?.desk === "D2", `${s.j?.spend}@${s.j?.posted_seq}`);
  const said = [];
  said.push(await call("g9", "a", "recused", "identify", ["D2", "1", IDENT]));
  said.push(await call("g10", "d", "recused", "identify", ["D2", "1", "It is the print shop that printed the annual report."]));
  said.push(await call("g11", "e", "recused", "identify", ["D2", "1", "The payee is the printer on Pelican Street."]));
  said.push(await call("g12", "b", "recused", "identify", ["D2", "1", "This address is Pelican Press, which I co-own with my sister."]));
  ok("four members say who the payee is, and the four places are taken", said.every((r) => r.j?.ok === true) && said.map((r) => r.j?.n).join() === "1,2,3,4", said.map((r) => r.j?.member).join(" "));
  const out = await call("g13", "f", "recused", "identify", ["D2", "1", "The payee is Pelican Press."]);
  ok("the fifth is turned away: not raised, stored, and counted on the spend", out.exec !== "ERROR" && out.j?.ok === false && out.j?.recorded === true && out.j?.shut_out === 1 && out.j?.member === "M6", out.j?.reason || out.msg.slice(0, 90));
  const again = await call("g14", "f", "recused", "identify", ["D2", "1", "The payee is Pelican Press, I am sure of it."]);
  ok("and may not try again", refused(again, "already said, or tried to say"), again.msg.slice(0, 80));
  await until("D2", 1, "notice_until");
  const doc = await seen("docD2", "recused", "document", ["D2", "1"]);
  console.log("      the judged document of D2 S1:\n" + String(doc.document).split("\n").map((l) => "        " + l).join("\n"));
  const lines = String(doc.document).split("\n"), lines2 = String(doc.document_in_second_order).split("\n");
  ok("the judged document says in the contract's own words that one member was turned away", lines.at(-1).endsWith("ARE NOT PRINTED: 1") && lines.filter((l) => l.startsWith("PAYEE IDENTIFIED BY")).length === 4);
  ok("and the second asking reads the same lines with every identification in another place", lines2.length === lines.length && [...lines].sort().join("\n") === [...lines2].sort().join("\n") && [6, 7, 8, 9].every((i) => lines[i] !== lines2[i]));
  const r = await call("g15", "d", "recused", "approve", ["D2", "1"]);
  ok("a reading is made of that document: four identifications seen, the digest sealed", r.applied && r.j?.model_asked === true && r.j?.idents_seen === 4 && r.j?.doc_digest === doc.digest, `${votes(r)} value ${r.j?.value} ${r.j?.verdict}`);
}

// ================================================================ phase H
console.log(`\n[${stamp()}] ---- phase H: the windows end`);
{
  await until("D1", 4, "window_until");
  const e4 = await call("h1", "b", "recused", "expire", ["D1", "4"]);
  ok("S4 is expired by a member who is not its poster; no money leaves", e4.j?.ok === true && e4.j?.state === "expired" && e4.j?.uncommitted === gen(30), JSON.stringify(e4.j).slice(0, 120));
  await until("D1", 5, "window_until");
  const e5 = await call("h2", "d", "recused", "expire", ["D1", "5"]);
  ok("S5 is expired with nothing counted on it", e5.j?.ok === true && e5.j?.approvals === 0, JSON.stringify(e5.j).slice(0, 120));
  for (const [x, id] of [["x1", "h2a"], ["x5", "h2b"]]) {
    if (!st.steps[x]) continue;
    const n = String(jsonOf(st.steps[x].tries.at(-1).msg)?.spend).slice(1);
    await until("D1", n, "window_until");
    const ex = await call(id, "a", "recused", "expire", ["D1", n]);
    ok(`S${n} is expired`, ex.j?.ok === true && ex.j?.state === "expired", JSON.stringify(ex.j).slice(0, 100));
  }

  console.log(`\n[${stamp()}]      a funder leaves while S3 is still open`);
  const A = { a: acct.a.address }, D = { d: acct.d.address };
  const credit = await seen("creditA1", "recused", "credit", ["D1", low("a")]);
  const rc = await call("h3", "a", "recused", "reclaim", ["D1"], { watch: A, expect: { a: 240n * GEN } });
  ok("the first funder takes half of the free balance, 240 GEN, and gives up every unit", rc.j?.ok === true && rc.j?.reclaimed === gen(240) && rc.j?.from_free_balance === gen(240) && rc.j?.from_expired_spends === "0" && rc.j?.units_given_up === gen(500) && credit.would_pay === gen(240) && moved(rc, "a", 240n * GEN), JSON.stringify(rc.j).slice(0, 160));
  ok("what those units stood for in S3 becomes a claim on S3 alone: 20 GEN", rc.j?.claimed_on_open_spends === gen(20) && JSON.stringify(rc.j?.waiting_on) === '["S3"]', JSON.stringify({ claimed: rc.j?.claimed_on_open_spends, waiting_on: rc.j?.waiting_on }));
  const none = await call("h4", "a", "recused", "reclaim", ["D1"], { watch: A, expect: { a: 0n } });
  ok("calling again takes nothing more: the claim waits for S3 to end", refused(none, "would pay nothing now") && moved(none, "a", 0n), none.msg.slice(0, 90));
  const held = await seen("creditA2", "recused", "credit", ["D1", low("a")]);
  ok("credit() shows no units, and the claim on S3", held.credit === "0" && held.would_pay === "0" && JSON.stringify(held.claims) === JSON.stringify([{ spend: "S3", amount: gen(20), state: "open" }]), JSON.stringify(held.claims));

  await until("D1", 3, "window_until");
  const e3 = await call("h5", "d", "recused", "expire", ["D1", "3"]);
  ok("S3 is expired by a member who did not post it, with its one clear reading; the claim on it is now owed", e3.j?.ok === true && e3.j?.approvals === 1 && e3.j?.committed === "0" && e3.j?.owed_to_funders_who_left === gen(20), JSON.stringify(e3.j).slice(0, 160));
  const e3b = await call("h6", "b", "recused", "expire", ["D1", "3"]);
  ok("a second expiry raises", refused(e3b, "already expired"), e3b.msg.slice(0, 60));
  const rc2 = await call("h7", "a", "recused", "reclaim", ["D1"], { watch: A, expect: { a: 20n * GEN } });
  ok("the funder who left is paid the 20 GEN owed on the expired spend", rc2.j?.ok === true && rc2.j?.reclaimed === gen(20) && rc2.j?.from_expired_spends === gen(20) && rc2.j?.from_free_balance === "0" && moved(rc2, "a", 20n * GEN), JSON.stringify(rc2.j).slice(0, 160));
  const rc3 = await call("h8", "d", "recused", "reclaim", ["D1"], { watch: D, expect: { d: 260n * GEN } });
  ok("the funder who arrived after the payments takes back exactly the 260 GEN they put in", rc3.j?.ok === true && rc3.j?.reclaimed === gen(260) && rc3.j?.pot === "0" && moved(rc3, "d", 260n * GEN), JSON.stringify(rc3.j).slice(0, 160));
  const thief = await call("h9", "c", "recused", "reclaim", ["D1"]);
  ok("an address with no credit reclaims nothing", refused(thief, "no funder credit"), thief.msg.slice(0, 60));

  console.log(`\n[${stamp()}]      the fixture, now that S3 has expired`);
  const back = await call("h10", "b", "fixture", "release", [st.dep3], { watch: { c: acct.c.address }, expect: { c: 10n * GEN } });
  ok("the deposit on the spend that expired goes back to its depositor", back.j?.state === "returned" && back.j?.to === low("c") && back.j?.ok === false && moved(back, "c", 10n * GEN), JSON.stringify(back.j).slice(0, 120));
  const doc2 = await seen("docS2", "recused", "document", ["D1", "2"]);
  const B = { b: acct.b.address };
  const dep9 = await call("h11", "b", "fixture", "deposit", ["D1", "9", K, doc2.sealed_digest], { value: 3n * GEN, watch: B, expect: { b: -3n * GEN } });
  const rel9 = await call("h12", "d", "fixture", "release", [String(dep9.j?.deposit)]);
  ok("a deposit on a spend the register does not have is held, and a release raises", dep9.j?.ok === true && refused(rel9, "the depositor may cancel"), rel9.msg.slice(0, 80));
  const notMine = await call("h13", "d", "fixture", "cancel", [String(dep9.j?.deposit)]);
  ok("only its depositor may cancel it", refused(notMine, "only the address that made deposit"), notMine.msg.slice(0, 80));
  const can = await call("h14", "b", "fixture", "cancel", [String(dep9.j?.deposit)], { watch: B, expect: { b: 3n * GEN } });
  ok("the depositor cancels and the 3 GEN comes back", can.j?.state === "cancelled" && can.j?.to === low("b") && moved(can, "b", 3n * GEN), JSON.stringify(can.j).slice(0, 120));

  console.log(`\n[${stamp()}]      the second desk is closed down`);
  await until("D2", 1, "window_until");
  const e2 = await call("h15", "b", "recused", "expire", ["D2", "1"]);
  ok("the spend on the second desk is expired", e2.j?.ok === true && e2.j?.state === "expired" && e2.j?.desk === "D2", JSON.stringify(e2.j).slice(0, 120));
  const rc4 = await call("h16", "a", "recused", "reclaim", ["D2"], { watch: A, expect: { a: 2n * GEN } });
  ok("and its opener takes the 2 GEN back", rc4.j?.ok === true && rc4.j?.reclaimed === gen(2) && rc4.j?.pot === "0" && moved(rc4, "a", 2n * GEN), JSON.stringify(rc4.j).slice(0, 120));
}

// ================================================================ phase I
console.log(`\n[${stamp()}] ---- phase I: what is on the chain, read back`);
{
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  st.code = st.code || {};
  for (const [name, target, path] of [["recused.py", "recused", "../../contracts/recused.py"], ["countersigned.py", "fixture", "../../contracts/fixtures/countersigned.py"]]) {
    const file = readFileSync(new URL(path, import.meta.url));
    const chain = Buffer.from(String(await rpc("gen_getContractCode", [st[target]])), "base64");
    st.code[name] = { address: st[target], bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
    save();
    ok(`the code deployed at ${st[target]} is byte for byte contracts/${name === "recused.py" ? "" : "fixtures/"}${name}`, st.code[name].identical, `${chain.length} bytes, sha256 ${st.code[name].sha256}`);
  }
  const v = {};
  const get = async (id, target, fn, args = []) => { v[id] = await seen("I_" + id, target, fn, args); return v[id]; };
  const d1 = await get("desk1", "recused", "desk", ["D1"]);
  const extra = (st.steps.x1 ? 1 : 0) + (st.steps.x5 ? 1 : 0);
  ok("desk(D1): nothing left in it, 240 GEN drawn, four members, two spends paid and the rest expired", d1.pot === "0" && d1.committed === "0" && d1.claims_open === "0" && d1.claims_due === "0" && d1.free === "0" && d1.drawn === gen(240) && d1.funded_total === "0" && d1.members === 4 && d1.spends === 5 + extra && d1.open_spends === 0 && JSON.stringify(d1.open) === "[]" && d1.paid === 2 && d1.expired === 3 + extra && d1.min_notice_minutes === 5 && d1.open_enrolment === true, JSON.stringify({ pot: d1.pot, drawn: d1.drawn, readings: d1.readings, refusals: d1.refusals }));
  const d2 = await get("desk2", "recused", "desk", ["D2"]);
  ok("desk(D2): six members, one spend expired, nothing left", d2.members === 6 && d2.spends === 1 && d2.expired === 1 && d2.pot === "0" && d2.drawn === "0", JSON.stringify({ members: d2.members, pot: d2.pot }));
  const page = await get("desks", "recused", "desks", []);
  ok("desks(): two desks, each with its minimum notice", page.count === 2 && page.rows.length === 2 && page.rows.every((r) => r.min_notice_minutes === 5), JSON.stringify(page.rows.map((r) => r.desk + ":" + r.members)));
  const mem = await get("members", "recused", "members", ["D1"]);
  ok("members(D1): the two who amended are at version 2 with later numbers, and nobody has a spend open", mem.count === 4 && mem.rows.map((r) => r.version).join() === "1,2,1,2" && mem.rows.every((r) => r.open_spends_posted === 0) && mem.rows[3].filed_seq > mem.rows[2].filed_seq && mem.rows[1].filed_seq > mem.rows[3].filed_seq, mem.rows.map((r) => r.member + "@" + r.filed_seq + "v" + r.version).join(" "));
  const md = await get("memberD", "recused", "member", ["D1", low("d")]);
  ok("member(D1, D): the amended disclosure, each relation in the contract's own phrase", md.version === 2 && md.n_entries === 2 && md.entries[1].name === VAGUE[0] && md.entries[0].relation_phrase === "the member is employed by it", JSON.stringify(md.entries.map((e) => e.name)));
  const s1 = await get("spend1", "recused", "spend", ["D1", "1"]);
  ok("spend(D1, 1): paid, both counted readings UU, its poster's attempt counted", s1.state === "paid" && s1.approvals === 2 && s1.approver1 === low("a") && s1.approver2 === low("d") && s1.approver1_value === "UU" && s1.approver2_value === "UU" && s1.poster_tried === 1 && s1.n_attempts === 3 && s1.doc_digest === st.views.docS1.out.digest, JSON.stringify({ state: s1.state, n_attempts: s1.n_attempts }));
  const s3 = await get("spend3", "recused", "spend", ["D1", "3"]);
  ok("spend(D1, 3): expired on one clear reading, the gate of S2, one identification carried, the claim that was made on it", s3.state === "expired" && s3.approvals === 1 && s3.gate_seq < s3.posted_seq && s3.run === 1 && s3.n_idents === 1 && s3.claimed === gen(20) && s3.poster_tried === 1, JSON.stringify({ gate_seq: s3.gate_seq, posted_seq: s3.posted_seq, claimed: s3.claimed }));
  const all = await get("spends", "recused", "spends", ["D1"]);
  ok("spends(D1): S1 and S2 paid, the others expired", all.rows.map((r) => r.state).slice(0, 5).join() === "paid,paid,expired,expired,expired", all.rows.map((r) => r.spend + ":" + r.state).join(" "));
  const r1 = await get("readings1", "recused", "readings", ["D1", "1"]);
  ok("readings(D1, 1): three rows, each with the sentence the contract wrote and the digest of the document it read", r1.count === 3 && r1.rows.map((r) => r.verdict).slice(1).join() === "clear,clear" && r1.rows.every((r) => r.doc_digest === s1.doc_digest && String(r.why).startsWith("If the spend is carried out, ")), r1.rows.map((r) => r.number + ":" + r.value + ":" + r.verdict).join(" "));
  const r5 = await get("readings5", "recused", "readings", ["D1", "5"]);
  ok("readings(D1, 5): two rows, both --, neither with a digest because neither read a document", r5.count === 2 && r5.rows.every((r) => r.value === "--" && r.doc_digest === "" && r.model_asked === false), r5.rows.map((r) => r.number + ":" + r.verdict).join(" "));
  const one = await get("reading5D", "recused", "reading", ["D1", "5", low("d")]);
  ok("reading(D1, 5, D): the reading that stands names the spend it was made on", one.ok === true && one.verdict === "standing" && one.stands_on === "S4" && one.model_asked === false, JSON.stringify({ verdict: one.verdict, stands_on: one.stands_on, stands_value: one.stands_value }));
  const runK = await get("runK", "recused", "run", ["D1", K]);
  ok("run(D1, bike group): ended by the payment of S2, with the one thing said in it", runK.run === 1 && runK.live === false && runK.first === "S2" && runK.identifications.length === 1 && runK.identifications[0].text === IDENT_KITTY, JSON.stringify({ live: runK.live, gate_seq: runK.gate_seq }));
  const runH = await get("runH", "recused", "run", ["D1", H]);
  ok("run(D1, hall): still live, because no spend to it was ever paid", runH.run === 1 && runH.live === true && runH.first === "S4", JSON.stringify({ live: runH.live, gate_seq: runH.gate_seq }));
  const i3 = await get("idents3", "recused", "idents", ["D1", "3"]);
  ok("idents(D1, 3): the identification made on S2, carried", i3.count === 1 && i3.rows[0].from === "S2" && i3.rows[0].text === IDENT_KITTY, JSON.stringify(i3.rows.map((r) => r.from)));
  const i2 = await get("identsD2", "recused", "idents", ["D2", "1"]);
  ok("idents(D2, 1): four identifications and one member turned away", i2.count === 4 && i2.shut_out === 1, JSON.stringify({ count: i2.count, shut_out: i2.shut_out }));
  const docH = await get("doc5", "recused", "document", ["D1", "5"]);
  ok("document(D1, 5): no member said who the hall is, and nothing was sealed because no reading read it", String(docH.document).includes("NO MEMBER OF THE FUND HAS SAID WHO THE PAYEE IS.") && docH.sealed === false && docH.sealed_digest === "", "");
  const ringD = await get("ringD1", "recused", "refusals", ["D1"]);
  ok("refusals(D1): the members' procedural refusals, each with who made it", Array.isArray(ringD) && ringD.length === d1.refusals && ringD.every((r) => r.ring === "D1" && /^0x[0-9a-f]{40}$/.test(r.by)), `${ringD.length} rows`);
  const ringO = await get("ringOpen", "recused", "refusals", ["open"]);
  ok("refusals(open): the refusals of callers with no standing on a desk", Array.isArray(ringO) && ringO.length === 4 && ringO.every((r) => r.ring === "open"), `${ringO.length} rows`);
  const cA = await get("creditA", "recused", "credit", ["D1", low("a")]);
  ok("credit(D1, A): nothing left to take", cA.credit === "0" && cA.would_pay === "0" && cA.claims.length === 0 && cA.reclaimable_now === false, "");
  const rule = await get("rule", "recused", "rule", []);
  ok("rule(): the agreement rule in words, with the run of a payee address and the refusal rings", typeof rule.value === "string" && "run" in rule && "refusals" in rule && "standing" in (rule.consequence || {}), Object.keys(rule).join(","));
  const terms = await get("terms", "fixture", "terms", []);
  ok("terms() of the fixture: bound to this register, four deposits", String(terms.register) === String(st.recused).toLowerCase() && terms.deposits === 4 && terms.ids.join() === "1,2,3,4", JSON.stringify({ deposits: terms.deposits }));
  const held = [];
  for (const id of ["1", "2", "3", "4"]) held.push(await get("held" + id, "fixture", "held", [id]));
  ok("held(1..4): released, refused, returned and cancelled", held.map((h) => h.state).join() === "released,refused,returned,cancelled", held.map((h) => h.state).join());
  const verdicts = new Set();
  for (const id of st.order) { const j = jsonOf(st.steps[id].tries.at(-1).msg); if (j?.verdict && j?.attempt_spent === true) verdicts.add(j.verdict); }
  ok("all six verdicts were written: clear, interested, unclear, declared, late, standing", ["clear", "interested", "unclear", "declared", "late", "standing"].every((x) => verdicts.has(x)), [...verdicts].join(" "));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.endPayees = { P: String(await balance(P)), K: String(await balance(K)), H: String(await balance(H)) };
  st.ended = new Date().toISOString();
  save();
  const net = (k) => (BigInt(st.end[k]) - BigInt(st.start[k])) / GEN;
  ok("over the run A is 240 GEN down, which is what the desk paid out while only A's money was in it, and B, C and D are level", net("a") === -240n && net("b") === 0n && net("d") === 0n && BigInt(st.end.c) - BigInt(st.start.c) === -25n * GEN, ["a", "b", "c", "d"].map((k) => k.toUpperCase() + " " + (BigInt(st.end[k]) - BigInt(st.start[k])) / GEN).join("  "));
  ok("the print shop holds 180 GEN and the bike group 85", BigInt(st.endPayees.P) === 180n * GEN && BigInt(st.endPayees.K) === 85n * GEN && BigInt(st.endPayees.H) === 0n, JSON.stringify(st.endPayees));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log("Recused:", st.recused, "- Countersigned:", st.fixture);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id], j = jsonOf(s.tries.at(-1).msg); if (j?.value) console.log(`${id.padEnd(8)} ${s.tries.map((t) => t.tx + " " + tally(t.votes)).join(" | ")}  ${j.value} ${j.verdict || ""}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
