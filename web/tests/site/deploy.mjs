/* Deploys a throwaway copy of the contract to GenLayer Studio (chain 61999) for a test run.
 *
 *   node tests/site/deploy.mjs          # prints the new register's address on the last line
 *
 * The key that signs is made here and thrown away: a register belongs to nobody, and nothing in
 * the contract gives its deployer any power. The source is ../contracts/recused.py when the site
 * sits inside the repository, else the copy the site serves (public/contracts/recused.py).
 * Deploys cost no fee on Studio, so the key needs no test GEN.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const RPC = "https://studio.genlayer.com/api";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoCopy = join(root, "..", "contracts", "recused.py");
const source = existsSync(repoCopy) ? repoCopy : join(root, "public", "contracts", "recused.py");
const code = readFileSync(source, "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chain = { ...studionet, rpcUrls: { ...studionet.rpcUrls, default: { http: [RPC] } } };
const account = createAccount(generatePrivateKey());
const client = createClient({ chain, account });

console.log(`deploying ${source} (${code.length} characters) from the throwaway key ${account.address}`);
const hash = await client.deployContract({ code, args: [], leaderOnly: false });
console.log(`deploy transaction ${hash}`);

let address = "";
for (let i = 0; i < 90 && !address; i++) {
  await sleep(4000);
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "eth_getTransactionByHash", params: [hash] }),
    });
    const tx = (await res.json()).result;
    const status = String(tx?.status ?? "");
    if (status === "ACCEPTED" || status === "FINALIZED") {
      const receipt = tx.consensus_data?.leader_receipt;
      const one = Array.isArray(receipt) ? receipt[0] : receipt;
      if (one?.execution_result && String(one.execution_result).toUpperCase() !== "SUCCESS") {
        console.error(`the deploy was ${status} but the contract did not load: ${one.execution_result}`);
        console.error(Buffer.from(one.result || "", "base64").toString("utf8").replace(/[^\x20-\x7e\n]/g, " ").slice(0, 600));
        process.exit(1);
      }
      address = tx.data?.contract_address ?? "";
    } else if (status === "CANCELED" || status === "UNDETERMINED") {
      console.error(`the deploy ended ${status}; nothing was created`);
      process.exit(1);
    }
  } catch {
    /* a dropped poll; the next one may answer */
  }
}
if (!address) {
  console.error("the deploy was not accepted within six minutes");
  process.exit(1);
}
console.log(address);
