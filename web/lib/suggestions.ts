// The one-click suggestions under every version 2 field: public names, register prefixes and
// page addresses, hold lengths, stakes and bond deposits. No React in here, so node checks every
// one of them against the contract's limits (tests/unit/suggestions.test.mjs).

import { CHALLENGE_BOND_ATTO, LIMITS, STAKE_ATTO } from "./contract";
import { REGISTER_PAGES, isDemoRegistry, pinnedRegistry, registryPrefixAt } from "./registry";

const GEN = 10n ** 18n;

/** Fictional names a member might give as the name a register lists them under. */
export const PUBLIC_NAME_SUGGESTIONS = ["Sam Arden", "Rosa Delgado", "Kofi Mensah", "Hana Sato", "Lena Brookes"];

export type Option<T> = { label: string; value: T };

/** How long a carried spend waits before it pays, open to challenge (minutes). */
export const HOLD_SUGGESTIONS: Option<number>[] = [
  { label: "5 minutes, a demonstration", value: 5 },
  { label: "45 minutes", value: 45 },
  { label: "1 day", value: 1440 },
  { label: "3 days", value: 4320 },
];

/** What every member stakes to sign (atto). */
export const STAKE_SUGGESTIONS: Option<bigint>[] = [
  { label: "0.1 GEN, the least", value: STAKE_ATTO[0] },
  { label: "0.5 GEN", value: GEN / 2n },
  { label: "1 GEN", value: GEN },
  { label: "5 GEN", value: 5n * GEN },
];

/** Bond credit to deposit before citing a page (atto). */
export const BOND_SUGGESTIONS: Option<bigint>[] = [
  { label: "0.05 GEN, one challenge", value: CHALLENGE_BOND_ATTO },
  { label: "0.1 GEN, two", value: 2n * CHALLENGE_BOND_ATTO },
  { label: "0.25 GEN, five", value: 5n * CHALLENGE_BOND_ATTO },
];

/** Register prefixes a desk may name: the demonstration register first, pinned when the site knows the commit. */
export function registrySuggestions(): Option<string>[] {
  const pinned = pinnedRegistry();
  const out: Option<string>[] = [];
  if (pinned) out.push({ label: "The demonstration register, pinned to one commit", value: pinned });
  out.push({ label: "The demonstration register, branch head", value: registryPrefixAt("main") });
  out.push({ label: "A companies register (example host)", value: "https://registry.example/companies/" });
  return out.filter((o) => o.value.length <= LIMITS.registryChars);
}

/** Page addresses to cite on a desk: each page of the demonstration register under its prefix, or the prefix to finish. */
export function pageSuggestions(registries: string[]): Option<string>[] {
  const out: Option<string>[] = [];
  for (const prefix of registries) {
    if (isDemoRegistry(prefix)) for (const p of REGISTER_PAGES) out.push({ label: p.company + (p.file.includes("former") ? ", former officers" : ""), value: prefix + p.file });
    else out.push({ label: "Start from " + prefix.replace(/^https:\/\//, ""), value: prefix });
  }
  return out.filter((o) => o.value.length <= LIMITS.urlChars);
}
