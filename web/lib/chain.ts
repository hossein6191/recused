// Chain access for Recused: the transport. The contract's interface itself (every method name,
// argument order, view shape, token and limit of contracts/recused.py the site depends on) is in
// lib/contract.ts, which this module re-exports, so pages import everything from "@/lib/chain".
// When the contract's interface changes, lib/contract.ts is the file to edit (and lib/chain-mock.ts,
// which stands in for the contract in mock mode and answers in the contract's own JSON shapes, so
// the same mappers run in both modes).
//
// Real implementation: genlayer-js against GenLayer Studio (chain 61999).
// Mock implementation (NEXT_PUBLIC_MOCK=1): lib/chain-mock.ts, an in-memory stand-in.
//
// Reads go through readContract (gen_call) with the retry policy in lib/rpc.ts: eight tries
// over about forty seconds, because Studio answers "Contract not found" for a healthy contract
// for about a minute after a deploy. A failed read is never "no data" and never proof that a
// write failed. Studio allows 30 gen_call a minute from one browser (the faucet shares them),
// so every view answer is cached for 30 s, two components asking for the same view share one
// request, and invalidateReads() drops the cache once a transaction is final. A read call
// fails once its encoded calldata passes 256 bytes, so every view here takes ids, numbers and
// addresses only.

import * as mock from "./chain-mock";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getAddress, type Address } from "viem";
import { registerOverride, siteRegister } from "./register";
import {
  RATE_LIMITED,
  createReadCache,
  decodeTx,
  isMissingMethodError,
  noteFailure,
  rpc,
  sleep,
  waitForCooldown,
  withRetry,
  type RawTx,
} from "./rpc";
import { getChainId, getSigner, chainName } from "./wallet";
import {
  LIMITS,
  asRow,
  isEmptyRow,
  mapBondCredit,
  mapChallengePage,
  mapCredit,
  mapDesk,
  mapDeskRow,
  mapDocument,
  mapIdent,
  mapLimits,
  mapMember,
  mapMemberRow,
  mapReading,
  mapRefusal,
  mapSpend,
  mapSpendRow,
  mapStats,
  parseView,
  rowsOf,
  versionOfRule,
  type Arg,
  type BondCredit,
  type Call,
  type ChallengePage,
  type Credit,
  type Desk,
  type DeskList,
  type Ident,
  type Limits,
  type Member,
  type MemberRow,
  type ReadResult,
  type Reading,
  type Refusal,
  type Row,
  type Run,
  type Spend,
  type SpendDocument,
  type SpendList,
  type Stats,
  type TxStatus,
  viewField,
} from "./contract";

export * from "./contract";
export { RATE_LIMITED, cooldownRemainingMs, waitForCooldown } from "./rpc";

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf22f";
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

/** The file /deploy serves and deploys: a byte copy of contracts/recused.py (tools/sync-contract.mjs). */
export const CONTRACT_SOURCE_PATH = "/contracts/recused.py";
export const CONTRACT_FILE = "contracts/recused.py";

export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
/** The register in use: this browser's choice from /deploy first, then the site's default. */
export const contractAddress = (): string => registerOverride() || siteRegister();

export const NETWORK_ERROR = "could not reach the network";
/** Thrown by reads when the site has no register address yet. */
export const NO_REGISTER = "no register is configured yet";
/** What the faucet says when Studio refused sim_fundAccount three times. */
export const FAUCET_REFUSED =
  "Studio refused the faucet request (it allows 30 requests a minute from one browser). Try again in a minute.";

// ---- low-level view access --------------------------------------------------

// The SDK's studionet object carries another explorer URL; the RPC and explorer hosts are set here.
const studio = {
  ...studionet,
  rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "GenLayer Studio Explorer", url: EXPLORER_URL } },
};

const reader = () => createClient({ chain: studio });

/** How long a view answer is reused. */
export const READ_TTL_MS = 30_000;
const onServer = typeof window === "undefined";
type Answer = { raw: unknown; at: number };
const views = createReadCache<Answer>(onServer ? 0 : READ_TTL_MS);

/** Forget every cached view answer. Called once a transaction is final or the faucet paid. */
export const invalidateReads = () => views.clear();

const viewKey = (address: string, fn: string, args: Arg[]) => `${address.toLowerCase()}|${fn}|${JSON.stringify(args)}`;

type ViewOptions = {
  /** drop the cached answer first, so this read is live */
  fresh?: boolean;
  /** read another register than the one in use (the /deploy page probes a pasted address) */
  register?: string;
};

/**
 * One view call through the cache, with the time its answer arrived. Throws RATE_LIMITED when
 * Studio is rate-limiting this browser, NO_REGISTER when no register is set, and the plain
 * network error when Studio never answered.
 */
async function viewAt(fn: string, args: Arg[] = [], opts: ViewOptions = {}): Promise<{ value: unknown; at: number }> {
  if (isMock) return { value: parseView(await mock.view(fn, args)), at: Date.now() };
  const address = opts.register || contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  const key = viewKey(address, fn, args);
  if (opts.fresh) views.forget(key);
  try {
    const answer = await views.get(key, async () => {
      const raw = await withRetry(
        () => reader().readContract({ address: address as Address, functionName: fn, args }),
        // A register with no such view is an answer, not flakiness: do not spend the bucket on it.
        { bucket: "gen", giveUp: isMissingMethodError },
      );
      return { raw, at: Date.now() };
    });
    return { value: parseView(answer.raw), at: answer.at };
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMITED) throw e;
    throw new Error(NETWORK_ERROR);
  }
}

const { num, str, bool, addr, secs } = viewField;

const SOURCE: ReadResult<unknown>["source"] = isMock ? "mock" : "chain";
const result = <T>(data: T): ReadResult<T> => ({ data, source: SOURCE });

// ---- reads: one function per view ------------------------------------------------

/** desks(): the most recently opened desks. `register` reads another register (the /deploy probe). */
export async function readDesks(register?: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<DeskList>> {
  const { value } = await viewAt("desks", [], { register, fresh: opts.fresh });
  const o = asRow(value);
  // An address that is not a Recused register answers something else entirely.
  if (!("rows" in o) && !("count" in o)) throw new Error(NETWORK_ERROR);
  const rows = rowsOf(o.rows).map(mapDeskRow).filter((d) => d.id);
  return result({ count: num(o.count, rows.length), first: num(o.first, 1), rows });
}

/** desks_from(start): one page of desks from a given number onwards, so every desk can be listed. */
export async function readDesksFrom(start: number): Promise<ReadResult<DeskList>> {
  const { value } = await viewAt("desks_from", [String(Math.max(1, Math.trunc(start)))]);
  const o = asRow(value);
  const rows = rowsOf(o.rows).map(mapDeskRow).filter((d) => d.id);
  return result({ count: num(o.count, rows.length), first: num(o.first, 1), rows });
}

/** desk(desk): null when the register holds no such desk. */
export async function readDesk(desk: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Desk | null>> {
  const { value, at } = await viewAt("desk", [desk], opts);
  return result(isEmptyRow(value) ? null : mapDesk(value as Row, desk, at));
}

/** members(desk): every member's number, address, sequence number and counts. */
export async function readMembers(desk: string): Promise<ReadResult<MemberRow[]>> {
  const { value } = await viewAt("members", [desk]);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapMemberRow));
}

/** member(desk, addr): the whole disclosure, or null when that address has none on the desk. */
export async function readMember(desk: string, address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Member | null>> {
  const { value } = await viewAt("member", [desk, address.toLowerCase()], opts);
  return result(isEmptyRow(value) ? null : mapMember(value as Row, desk));
}

/** spends(desk): the most recent spends of the desk, oldest of them first. */
export async function readSpends(desk: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<SpendList>> {
  const { value, at } = await viewAt("spends", [desk], opts);
  if (isEmptyRow(value)) return result({ desk, count: 0, first: 1, rows: [], chainNow: 0, readAtMs: at });
  const o = asRow(value);
  const rows = rowsOf(o.rows).map((r) => mapSpendRow(r, desk));
  return result({ desk, count: num(o.count, rows.length), first: num(o.first, 1), rows, chainNow: secs(o.now), readAtMs: at });
}

/** spend(desk, n): null when the desk holds no such spend. */
export async function readSpend(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Spend | null>> {
  const { value, at } = await viewAt("spend", [desk, String(n)], opts);
  return result(isEmptyRow(value) ? null : mapSpend(value as Row, desk, at));
}

/** readings(desk, n): every reading on the spend, in the order written. */
export async function readReadings(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Reading[]>> {
  const { value } = await viewAt("readings", [desk, String(n)], opts);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapReading));
}

/** run(desk, payee): the run of spends to one payee address, with its gate; null when the desk does not exist. */
export async function readRun(desk: string, payee: string): Promise<ReadResult<Run | null>> {
  const { value } = await viewAt("run", [desk, payee.toLowerCase()]);
  if (isEmptyRow(value)) return result(null);
  const r = value as Row;
  return result({
    desk: str(r.desk ?? desk),
    payee: addr(r.payee),
    run: num(r.run),
    live: bool(r.live),
    gateSeq: num(r.gate_seq),
    first: str(r.first),
    identifications: rowsOf(r.identifications).length,
  });
}

/** reading(desk, n, addr): one member's stored reading, or null when there is none. */
export async function readReading(desk: string, n: number, address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<Reading | null>> {
  const { value } = await viewAt("reading", [desk, String(n), address.toLowerCase()], opts);
  return result(isEmptyRow(value) ? null : mapReading(value as Row));
}

/** document(desk, n): the spend document exactly as it is judged, with its sha256. */
export async function readDocument(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<SpendDocument | null>> {
  const { value, at } = await viewAt("document", [desk, String(n)], opts);
  return result(isEmptyRow(value) ? null : mapDocument(value as Row, at));
}

/** idents(desk, n): every identification of the payee, with its author. */
export async function readIdents(desk: string, n: number, opts: { fresh?: boolean } = {}): Promise<ReadResult<Ident[]>> {
  const { value } = await viewAt("idents", [desk, String(n)], opts);
  if (isEmptyRow(value)) return result([]);
  return result(rowsOf(asRow(value).rows).map(mapIdent));
}

/** The ring that keeps the refusals of callers with no disclosure on the desk they named. */
export const OPEN_RING = "open";

/**
 * refusals(desk): the ring of procedural refusals, oldest first. A desk's own ring holds only
 * the refusals of its members; OPEN_RING is the ring of every other caller, whichever desk they named.
 */
export async function readRefusals(desk: string): Promise<ReadResult<Refusal[]>> {
  const { value } = await viewAt("refusals", [desk]);
  return result(rowsOf(value).map(mapRefusal));
}

/** credit(desk, addr): one funder's units and what reclaim would pay them now. */
export async function readCredit(desk: string, address: string): Promise<ReadResult<Credit | null>> {
  const { value } = await viewAt("credit", [desk, address.toLowerCase()]);
  return result(isEmptyRow(value) ? null : mapCredit(value as Row, desk, address));
}

/** rule(): the limits the deployed contract enforces. The built-in defaults stand in when it cannot be read. */
export async function readLimits(): Promise<ReadResult<Limits>> {
  const { value } = await viewAt("rule", []);
  return result(isEmptyRow(value) ? LIMITS : mapLimits(value as Row));
}

/**
 * rule() again (the same cached answer readLimits shares): 2 when the register runs version 2,
 * whose rule publishes its register round, and 1 when it is the version 1 contract, which takes
 * none of the version 2 calls.
 */
export async function readRegisterVersion(): Promise<ReadResult<1 | 2>> {
  const { value } = await viewAt("rule", []);
  return result(isEmptyRow(value) ? 2 : versionOfRule(value as Row));
}

/** challenges_of(desk, n, offset, limit): one page of the challenges read on a spend, oldest first, at most 20. */
export async function readChallenges(
  desk: string,
  n: number,
  offset = 0,
  limit: number = LIMITS.challengesPage,
  opts: { fresh?: boolean } = {},
): Promise<ReadResult<ChallengePage | null>> {
  const size = Math.max(1, Math.min(Math.trunc(limit), LIMITS.challengesPage));
  const { value, at } = await viewAt("challenges_of", [desk, String(n), String(Math.max(0, Math.trunc(offset))), String(size)], opts);
  return result(isEmptyRow(value) ? null : mapChallengePage(value as Row, desk, at));
}

/** bond_credit_of(addr): one address's bond credit, and how many challenges it covers. */
export async function readBondCredit(address: string, opts: { fresh?: boolean } = {}): Promise<ReadResult<BondCredit>> {
  const { value } = await viewAt("bond_credit_of", [address.toLowerCase()], opts);
  return result(mapBondCredit(asRow(value), address));
}

/** stats(): what the whole register has done, in counts and atto. */
export async function readStats(): Promise<ReadResult<Stats>> {
  const { value } = await viewAt("stats", []);
  return result(mapStats(asRow(value)));
}

// ---- writes ------------------------------------------------------------------------

const WRONG_CHAIN = (chainId: number | null) =>
  `Your wallet is on ${chainName(chainId)}. Switch it to GenLayer Studio (chain 61999) before signing.`;

/** Sends a call through the connected EIP-1193 provider. Resolves to the transaction hash. */
export async function write(call: Call): Promise<string> {
  if (isMock) return mock.write(call.fn, call.args, call.value ?? 0n);
  const address = contractAddress();
  if (!address)
    throw new Error(
      "This site is not pointed at a register yet. Deploy your own from the Deploy page; it takes one signature and this browser then reads it.",
    );
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  // Studio is gasless and the SDK skips its own chain check for it, so the refusal to sign on
  // another chain lives here, and it says which chain the wallet is on.
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

// ---- page-held keys: the practice desk's other members ---------------------------------
// The practice desk (/practice) plays the members a lone visitor would otherwise have to find.
// Their keys are made in the browser, kept in its storage, and sign here with the SDK's own
// local-account path: the same writeContract as the wallet's, with no provider in between.
// They are throwaway keys that only ever hold test GEN.

/** A new private key, made in this browser. */
export const newKey = (): string => generatePrivateKey();

/** The lowercase address of a page-held key. */
export const keyAddress = (key: string): string => createAccount(key as `0x${string}`).address.toLowerCase();

/** Sends a call signed by a page-held key. Resolves to the transaction hash. */
export async function writeAs(key: string, call: Call): Promise<string> {
  if (isMock) return mock.write(call.fn, call.args, call.value ?? 0n, keyAddress(key));
  const address = contractAddress();
  if (!address) throw new Error(NO_REGISTER);
  const client = createClient({ chain: studio, account: createAccount(key as `0x${string}`) });
  const hash = await client.writeContract({
    address: address as Address,
    functionName: call.fn,
    args: call.args,
    value: call.value ?? 0n,
  });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The network returned no transaction hash.");
  return hash;
}

/** Demo mode only: moves the in-memory contract's clock forward. Does nothing on the chain. */
export function skipMockClock(seconds: number): void {
  if (isMock) mock.skipClock(seconds);
}

// ---- deploy, transactions, balances -------------------------------------------------

/** Deploys the contract source from the connected wallet (the /deploy page). Resolves to the deploy tx hash. */
export async function deploy(code: string): Promise<string> {
  if (isMock) return mock.deploy();
  const signer = getSigner();
  if (!signer) throw new Error("Connect a wallet first.");
  const chainId = await getChainId(signer.provider);
  if (chainId !== CHAIN_ID) throw new Error(WRONG_CHAIN(chainId));
  const client = createClient({ chain: studio, account: signer.address as Address, provider: signer.provider });
  // The contract's constructor takes no arguments.
  const hash = await client.deployContract({ code, args: [], leaderOnly: false });
  if (typeof hash !== "string" || !hash.startsWith("0x")) throw new Error("The wallet returned no transaction hash.");
  return hash;
}

/** The address a deploy transaction created; "" until the network has accepted it. */
export async function deployedAddress(hash: string): Promise<string> {
  if (isMock) return mock.MOCK_REGISTER;
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  const data = tx?.data as { contract_address?: string } | undefined;
  return typeof data?.contract_address === "string" ? data.contract_address : "";
}

/** One poll of a transaction. Pages call this every 3 s until it is final. */
export async function txStatus(hash: string): Promise<TxStatus> {
  if (isMock) return mock.txStatus(hash);
  // Two quick tries: the caller polls anyway, so a dropped request is just a later poll.
  // eth_* has its own bucket, so a gen_call cooldown never stalls the rail.
  const tx = await withRetry(() => rpc<RawTx | null>("eth_getTransactionByHash", [hash]), { tries: 2, bucket: "eth" });
  return decodeTx(tx);
}

/** Balance in atto of an address (eth_getBalance). */
export async function balanceOf(address: string): Promise<bigint> {
  if (isMock) return mock.balanceOf(address);
  const hex = await withRetry(() => rpc<string>("eth_getBalance", [address, "latest"]), { tries: 3, bucket: "eth" });
  return BigInt(hex || "0x0");
}

/** Pause between faucet tries: sim_fundAccount shares the 30 a minute bucket with the reads. */
const FAUCET_PAUSE_MS = 10_000;
const FAUCET_TRIES = 3;
/** How long the faucet waits for the credit to show in the balance. */
const FAUCET_WAIT_MS = 60_000;

/**
 * Faucet: sim_fundAccount with 10 GEN (amount in wei as a JS number), up to three tries ten
 * seconds apart, each one after the gen_call cooldown. Resolves when the balance moved; a
 * refusal on every try is FAUCET_REFUSED. `stillWanted` is asked between balance polls: once
 * it says no (the wallet switched accounts), the wait ends with an error nobody shows.
 */
export async function faucet(address: string, opts: { stillWanted?: () => boolean } = {}): Promise<bigint> {
  if (isMock) return mock.faucet(address);
  // Studio credits only a checksummed address: sim_fundAccount with the lowercase spelling
  // the site keeps is accepted, finalizes with value 10 GEN, and never reaches the balance.
  let account: string;
  try {
    account = getAddress(address);
  } catch {
    throw new Error("That is not a valid 0x address, so the faucet was not asked.");
  }
  let before: bigint;
  try {
    before = await balanceOf(account);
  } catch {
    throw new Error("Could not read this wallet's balance from Studio, so the faucet was not asked. Try again in a few seconds.");
  }
  let sent = false;
  for (let i = 0; i < FAUCET_TRIES && !sent; i++) {
    await waitForCooldown("gen");
    try {
      // `amount` is wei as a JS number; a decimal string makes the node compare str with int.
      await rpc("sim_fundAccount", { account_address: account, amount: 10e18 });
      sent = true;
    } catch (e) {
      // A refusal is a refusal whatever the shape: 429 behind CORS, -32029, or a dropped
      // request. A rate-limited one also starts the gen_call cooldown, so the reads back off too.
      noteFailure(e, Date.now(), "gen");
      if (i === FAUCET_TRIES - 1) throw new Error(FAUCET_REFUSED);
      await sleep(FAUCET_PAUSE_MS);
    }
  }
  const started = Date.now();
  while (Date.now() - started < FAUCET_WAIT_MS) {
    await sleep(2000);
    if (opts.stillWanted && !opts.stillWanted()) throw new Error("The faucet wait ended: the wallet switched accounts.");
    try {
      const now = await balanceOf(account);
      if (now !== before) return now;
    } catch {
      /* a dropped poll is not a failed faucet; keep polling */
    }
  }
  throw new Error("The faucet did not credit the account within 60 s. Try again.");
}

export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER_URL}/address/${address}`;
