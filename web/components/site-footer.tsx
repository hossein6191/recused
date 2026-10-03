import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { RegisterLine } from "@/components/register-line";
import { REPO_URL, SITE_TAGLINE } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-background/60">
      <div className="container-site grid gap-8 py-10 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-3">
          <Logo />
          <p className="text-muted-foreground">{SITE_TAGLINE}</p>
          <a
            href="https://genlayer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>Built on</span>
            {/* The GenLayer wordmark is used as shipped; the site never recolours it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/GenLayer_Logo_White_Cropped.svg" alt="GenLayer" height={16} className="h-4 w-auto" />
          </a>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">Contract</h2>
          <RegisterLine />
          <p className="text-xs text-muted-foreground">
            GenLayer Studio, chain 61999.{" "}
            <a href="https://explorer-studio.genlayer.com" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
              Explorer
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href="/deploy" className="underline-offset-4 hover:underline">
              Deploy your own copy
            </Link>{" "}
            from the same source.
          </p>
          <p className="text-xs text-gold">Studio test network. Test GEN only, no real money.</p>
        </div>

        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">Read more</h2>
          <ul className="space-y-1 text-xs">
            <li>
              <Link href="/ledger" className="underline-offset-4 hover:underline">
                Every spend and every recusal
              </Link>
            </li>
            <li>
              <a href="/contracts/recused.py" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                The contract source <ExternalLink className="size-3" />
              </a>
            </li>
            {REPO_URL ? (
              <li>
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                  Source repository <ExternalLink className="size-3" />
                </a>
              </li>
            ) : null}
            <li>
              <a href="https://docs.genlayer.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                GenLayer docs <ExternalLink className="size-3" />
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
