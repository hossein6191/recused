// Which register this browser reads and writes.
//
// The site ships one default (NEXT_PUBLIC_CONTRACT, then lib/config DEMO_CONTRACT). A visitor who
// deploys their own register from /deploy, or pastes an address there, overrides it for this
// browser only (localStorage). The same store remembers which desk the visitor last opened.

import { DEFAULT_DESK, DEMO_CONTRACT } from "./config";
import { readItem, writeItem } from "./browser-store";

export const REGISTER_KEY = "recused:register";
export const LAST_DEPLOY_KEY = "recused:last-deploy";
export const DESK_KEY = "recused:desk";
export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
export const DESK_RE = /^D[1-9]\d{0,8}$/;

export const isAddress = (s: string): boolean => ADDRESS_RE.test(s);
export const isDeskId = (s: string): boolean => DESK_RE.test(s);

/** The site's own default register (env first, then the committed address). */
export const siteRegister = (): string => process.env.NEXT_PUBLIC_CONTRACT || DEMO_CONTRACT || "";

/** The register this browser chose on /deploy, or "" (always "" on the server). */
export function registerOverride(): string {
  const v = readItem(REGISTER_KEY);
  return isAddress(v) ? v : "";
}

export function setRegisterOverride(address: string | null): void {
  writeItem(REGISTER_KEY, address && isAddress(address) ? address : null);
}

export type LastDeploy = { address: string; hash: string; at: string };

/** The raw stored record, "" when none (a string, so it can be a stable store snapshot). */
export const lastDeployRaw = (): string => readItem(LAST_DEPLOY_KEY);

export function parseLastDeploy(raw: string): LastDeploy | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as LastDeploy;
    return d && isAddress(d.address) ? d : null;
  } catch {
    return null;
  }
}

export function rememberDeploy(d: LastDeploy): void {
  writeItem(LAST_DEPLOY_KEY, JSON.stringify(d));
}

/** "yours" when this browser overrode the register, "site" when the shipped default is in use, "none" otherwise. */
export function registerSource(): "yours" | "site" | "none" {
  if (registerOverride()) return "yours";
  return siteRegister() ? "site" : "none";
}

/** The desk this browser last opened, else the site's default desk. */
export function currentDesk(): string {
  const v = readItem(DESK_KEY);
  return isDeskId(v) ? v : DEFAULT_DESK;
}

export function setCurrentDesk(desk: string): void {
  writeItem(DESK_KEY, isDeskId(desk) && desk !== DEFAULT_DESK ? desk : null);
}

const LAST_READING_KEY = "recused:last-reading";

/** Remembered when a countersignature of this browser's was stored, so the guide can find it after the spend closed. */
export function rememberReading(desk: string, n: number, address: string): void {
  writeItem(LAST_READING_KEY, JSON.stringify({ desk, n, address: address.toLowerCase() }));
}

/** The number of the spend this address last countersigned on this desk from this browser; 0 when none. */
export function lastReading(desk: string, address: string): number {
  try {
    const v = JSON.parse(readItem(LAST_READING_KEY) || "null") as { desk?: string; n?: number; address?: string } | null;
    return v && v.desk === desk && v.address === address.toLowerCase() && typeof v.n === "number" ? v.n : 0;
  } catch {
    return 0;
  }
}
