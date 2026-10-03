"use client";

import { Wallet, ArrowRightLeft } from "lucide-react";

import { useWallet, WalletButton } from "@/components/wallet";
import { Button } from "@/components/ui/button";
import { CHAIN_ID, isMock } from "@/lib/chain";
import { cn } from "@/lib/utils";

/**
 * Inline prompt for anything that needs a signature. Reads never sit behind this; only the
 * button that signs does. Shows the connect button, or the chain switch when the wallet is elsewhere.
 */
export function WalletGate({
  action = "sign",
  className,
  children,
}: {
  /** e.g. "countersign", "file a disclosure", "post a spend" */
  action?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const w = useWallet();
  // Mock mode has no wallet: every signing button works against the in-memory contract.
  if (isMock) return <>{children}</>;
  if (!w.address) {
    return (
      <div className={cn("flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-4 text-sm", className)}>
        <div className="flex items-center gap-2 font-medium">
          <Wallet className="size-4 text-primary" /> Connect a wallet to {action}.
        </div>
        <p className="text-muted-foreground">
          Reading needs no wallet. Signing does: pick one from the list, then come back here. It takes a few seconds.
        </p>
        <WalletButton />
      </div>
    );
  }
  if (!w.onStudio) {
    return (
      <div className={cn("flex flex-col items-start gap-3 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm", className)}>
        <div className="flex items-center gap-2 font-medium">
          <ArrowRightLeft className="size-4 text-gold" /> Your wallet is on chain {w.chainId ?? "unknown"}, not GenLayer Studio ({CHAIN_ID}).
        </div>
        <p className="text-muted-foreground">Nothing is signed on another chain. Switch first; the wallet asks once.</p>
        <Button type="button" variant="cool" onClick={() => void w.switchToStudio()}>
          Switch to Studio
        </Button>
        {w.error ? <p className="text-xs text-breaks">{w.error}</p> : null}
      </div>
    );
  }
  return <>{children}</>;
}
