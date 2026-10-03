"use client";

// The register this browser reads, for the footer: the address, where it came from, and the
// deploy link. Client side, because the choice made on /deploy lives in this browser only.
// YourRegisterNotice is the way back: pages show it wherever an empty or failed read could be
// the register's doing rather than the network's.

import type { ReactElement } from "react";
import Link from "next/link";
import { ExternalLink, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addressUrl, contractAddress, isMock } from "@/lib/chain";
import { registerOverride, registerSource, setRegisterOverride, siteRegister } from "@/lib/register";
import { short } from "@/lib/format";
import { useLocal } from "@/components/use-local";
import { cn } from "@/lib/utils";

/**
 * "This browser reads your own register 0x…" with a button back to the site's register.
 * Renders nothing unless this browser overrode the register on /deploy.
 */
export function YourRegisterNotice({ className }: { className?: string }): ReactElement | null {
  const yours = useLocal(() => registerSource() === "yours", false);
  const address = useLocal(registerOverride, "");
  const site = siteRegister();
  if (!yours || !address) return null;

  const back = () => {
    setRegisterOverride(null);
    // Every page re-reads from the site's register; a reload also drops what this one showed.
    window.location.reload();
  };

  return (
    <div role="note" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground", className)}>
      <span>
        This browser reads your own register{" "}
        <a
          href={addressUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-foreground underline-offset-4 hover:underline"
          title={address}
        >
          {short(address, 6, 4)}
        </a>
        , chosen on the Deploy page.
      </span>
      {site ? (
        <Button type="button" variant="outline" size="sm" onClick={back}>
          <Undo2 /> Back to the site&apos;s register
        </Button>
      ) : (
        <Link href="/deploy" className="text-primary underline-offset-4 hover:underline">
          Change it on the Deploy page
        </Link>
      )}
    </div>
  );
}

export function RegisterLine() {
  // The server renders the site default; the browser re-reads once its own choice is known.
  const contract = useLocal(() => contractAddress(), siteRegister());

  return (
    <>
      {contract ? (
        <a
          href={addressUrl(contract)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 break-hash font-mono text-xs text-primary underline-offset-4 hover:underline"
          title={contract}
        >
          {short(contract, 10, 8)}
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isMock ? "Demo mode: an in-memory copy, not a deployed register. " : "No register is configured yet. "}
          <Link href="/deploy" className="text-primary underline-offset-4 hover:underline">
            Deploy one
          </Link>{" "}
          from your wallet.
        </p>
      )}
      <YourRegisterNotice />
    </>
  );
}
