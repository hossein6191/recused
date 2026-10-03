"use client";

import { TxRail } from "@/components/tx-rail";
import type { TxRun } from "@/components/use-tx";

/** What every signing button shows under it: the wallet's own error, then the transaction's progress. */
export function TxBlock({ tx, label, votes, className }: { tx: TxRun; label: string; votes?: boolean; className?: string }) {
  if (!tx.error && !tx.hash) return null;
  return (
    <div className={className}>
      {tx.error ? (
        <p role="alert" className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-foreground">
          {tx.error}
        </p>
      ) : null}
      {tx.hash ? <TxRail hash={tx.hash} label={label} onDone={tx.onDone} showVotes={votes} /> : null}
    </div>
  );
}
