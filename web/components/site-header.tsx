"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { WalletButton } from "@/components/wallet";
import { MockPersona } from "@/components/mock-bar";
import { CHAIN_ID, isMock } from "@/lib/chain";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/practice", label: "Practice desk" },
  { href: "/desk", label: "Desk" },
  { href: "/enrol", label: "Enrol" },
  { href: "/spend/new", label: "Post a spend" },
  { href: "/ledger", label: "Ledger" },
  { href: "/deploy", label: "Deploy" },
] as const;

/** The network pill. With `compact`, the text goes under 420 px and only the dot stays. */
export function NetworkBadge({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 text-[11px] font-medium whitespace-nowrap text-primary",
        className,
      )}
      title={isMock ? "Demo mode: an in-memory copy of the contract" : `GenLayer Studio test network (chain ${CHAIN_ID})`}
      aria-label={isMock ? "Demo mode" : `GenLayer Studio, chain ${CHAIN_ID}`}
    >
      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
      <span className={cn(compact && "hidden min-[420px]:inline")}>{isMock ? "Demo mode" : `Studio · ${CHAIN_ID}`}</span>
    </span>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/spend/new") return pathname === "/spend/new";
  if (href === "/desk") return pathname === "/desk" || (pathname.startsWith("/spend/") && pathname !== "/spend/new");
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container-site flex flex-col gap-2 py-2 sm:h-16 sm:flex-row sm:items-center sm:gap-6 sm:py-0">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          {/* The mobile row may shrink but never push the page wider than the screen. */}
          <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:hidden">
            <NetworkBadge compact />
            {isMock ? null : <WalletButton />}
          </div>
        </div>
        <nav aria-label="Main" className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-1 sm:gap-1">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent hover:text-foreground sm:px-3",
                  active ? "bg-accent text-foreground" : "text-muted-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-3 sm:flex">
          <NetworkBadge />
          {isMock ? null : <WalletButton />}
        </div>
      </div>
      {isMock ? <MockPersona /> : null}
    </header>
  );
}
