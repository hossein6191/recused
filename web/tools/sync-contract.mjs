// Keeps the contract the site serves and deploys identical to the one in the repository.
//
//   node tools/sync-contract.mjs           copy ../contracts/recused.py over public/contracts/recused.py
//   node tools/sync-contract.mjs --check   exit 1 when the two differ, and change nothing
//
// The /deploy page deploys public/contracts/recused.py and prints its sha256, so the two files
// must be the same bytes. `npm run build` runs the check first; tests/unit/contract-copy.test.mjs
// runs it too. When the site is built without the repository around it (only this folder was
// uploaded), there is no source to compare with and the check passes on the served copy alone.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = join(root, "..", "contracts", "recused.py");
export const SERVED = join(root, "public", "contracts", "recused.py");

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** { same, source, served }: the sha256 of each file, "" for one that is not there. */
export function compare() {
  const source = existsSync(SOURCE) ? sha(readFileSync(SOURCE)) : "";
  const served = existsSync(SERVED) ? sha(readFileSync(SERVED)) : "";
  return { same: !!served && (source === "" || source === served), source, served };
}

function main() {
  const check = process.argv.includes("--check");
  if (!check) {
    if (!existsSync(SOURCE)) {
      console.error("sync-contract: ../contracts/recused.py is not there, nothing to copy");
      process.exit(1);
    }
    mkdirSync(dirname(SERVED), { recursive: true });
    writeFileSync(SERVED, readFileSync(SOURCE));
  }
  const r = compare();
  if (!r.served) {
    console.error("sync-contract: public/contracts/recused.py is missing; run `node tools/sync-contract.mjs`");
    process.exit(1);
  }
  if (!r.same) {
    console.error("sync-contract: public/contracts/recused.py differs from ../contracts/recused.py");
    console.error("  repository " + r.source);
    console.error("  served     " + r.served);
    console.error("run `node tools/sync-contract.mjs` to copy the repository's file over the served one");
    process.exit(1);
  }
  console.log(`sync-contract: ${check ? "identical" : "copied"}, sha256 ${r.served}${r.source ? "" : " (no repository copy to compare with)"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
