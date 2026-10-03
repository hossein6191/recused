"use client";

// Mock mode only. There is no wallet and no chain: the visitor acts as one of the demo accounts
// of the in-memory contract, and this bar says so on every page and lets them change account.

import { useLocal } from "@/components/use-local";
import { PERSONAS, mockAddress, mockBalanceText, setMockPersona } from "@/lib/chain-mock";
import { faucet } from "@/lib/chain";
import { gen, short } from "@/lib/format";

export function MockPersona() {
  const address = useLocal(mockAddress, PERSONAS[0].address);
  const balance = useLocal(() => mockBalanceText(mockAddress()), "0");
  return (
    <div className="border-t border-gold/30 bg-gold/10">
      <div className="container-site flex flex-col gap-2 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="text-foreground/90">
          <strong className="font-semibold text-gold">Demo mode.</strong> An in-memory copy of the contract with scripted
          readings. Nothing here is on chain, and a reload starts it again.
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="mock-persona" className="shrink-0 text-muted-foreground">
            Acting as
          </label>
          <select
            id="mock-persona"
            value={address}
            onChange={(e) => setMockPersona(e.target.value)}
            className="h-7 max-w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs"
          >
            {PERSONAS.map((p) => (
              <option key={p.address} value={p.address}>
                {p.name} ({p.note})
              </option>
            ))}
          </select>
          <span className="font-mono text-muted-foreground" title={address}>
            {short(address)} · {gen(balance)}
          </span>
          <button
            type="button"
            onClick={() => void faucet(address)}
            className="rounded-md border border-input bg-background px-2 py-1 hover:bg-accent"
          >
            Get 10 test GEN
          </button>
        </div>
      </div>
    </div>
  );
}
