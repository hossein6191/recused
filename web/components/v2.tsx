"use client";

// The pieces version 2 adds to every page that shows a hold, a challenge or a stake: the panel that
// answers the five waiting questions, the result card of one challenge, the public name field, and
// the line that says a register still runs version 1.

import * as React from "react";
import Link from "next/link";
import { CircleCheck, Clock3, FileSearch, Footprints, HelpCircle, Hourglass, Repeat2, ShieldAlert, Wallet } from "lucide-react";

import { Address, TxLink } from "@/components/address";
import { Suggest } from "@/components/suggest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRead } from "@/components/use-read";
import { LIMITS, publicNameProblem, readRegisterVersion, type Challenge, type ChallengeVerdict } from "@/lib/chain";
import { gen, short, when } from "@/lib/format";
import { registerPageOf } from "@/lib/registry";
import { PUBLIC_NAME_SUGGESTIONS } from "@/lib/suggestions";
import type { WaitLines } from "@/lib/waiting";
import { challengeLabel, challengeMeaning } from "@/lib/words";
import { cn } from "@/lib/utils";

const ROWS: [keyof WaitLines, string, React.ComponentType<{ className?: string }>][] = [
  ["what", "What is happening", FileSearch],
  ["howLong", "How long", Clock3],
  ["act", "Needed from you", Footprints],
  ["leave", "Can you leave", Hourglass],
  ["money", "Where the money is", Wallet],
];

/** One waiting moment, in the five lines every wait on this site answers. */
export function WaitPanel({ lines, title, tone = "plain", className }: { lines: WaitLines; title?: string; tone?: "plain" | "busy" | "good" | "warn"; className?: string }) {
  return (
    <div
      role="status"
      data-wait={tone}
      className={cn(
        "space-y-2 rounded-xl border p-4 text-sm",
        tone === "busy" ? "border-primary/40 bg-primary/5" : tone === "good" ? "border-keeps/40 bg-keeps/10" : tone === "warn" ? "border-gold/40 bg-gold/10" : "bg-background/40",
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <dl className="grid gap-2">
        {ROWS.map(([key, label, Icon]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" /> {label}
            </dt>
            <dd className="text-foreground/90">{lines[key]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const VERDICT_STYLE: Record<ChallengeVerdict, string> = {
  hidden: "border-breaks/50 bg-breaks/10 text-breaks",
  clean: "border-keeps/40 bg-keeps/10 text-keeps",
  unclear: "border-gold/40 bg-gold/10 text-gold",
  repeat: "border-border bg-muted text-muted-foreground",
};
const VERDICT_ICON: Record<ChallengeVerdict, React.ComponentType<{ className?: string }>> = {
  hidden: ShieldAlert,
  clean: CircleCheck,
  unclear: HelpCircle,
  repeat: Repeat2,
};

export function ChallengeBadge({ verdict, className }: { verdict: ChallengeVerdict; className?: string }) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase", VERDICT_STYLE[verdict], className)}>
      <Icon className="size-3 shrink-0" />
      {challengeLabel(verdict)}
    </span>
  );
}

/** One challenge as it settled: the finding, the page every validator read, its fingerprint, and the money it moved. */
export function ChallengeCard({ c, me, hash, className }: { c: Challenge; me?: string; hash?: string | null; className?: string }) {
  const page = registerPageOf(c.url);
  const mine = !!me && c.challenger === me;
  return (
    <div data-challenge={c.verdict} className={cn("space-y-3 rounded-xl border bg-card p-4 text-sm", c.verdict === "hidden" && "ring-1 ring-breaks/40", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChallengeBadge verdict={c.verdict} />
        <span className="text-xs text-muted-foreground">
          Challenge {c.n} on {c.spend}
          {c.hold > 1 ? `, hold ${c.hold}` : ""}
          {c.at ? ` · ${when(c.at)}` : ""}
        </span>
      </div>
      <p className="text-foreground/90">
        Against <strong>{c.member}</strong>, listed as <strong>{c.publicName || "no public name"}</strong>{" "}
        <Address value={c.memberAddr} className="text-xs" />
      </p>
      <div className="space-y-1 rounded-lg border bg-background/40 p-3 text-xs">
        <p className="text-muted-foreground">The page every validator fetched and read</p>
        <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-hash font-mono text-primary underline-offset-4 hover:underline">
          {c.url}
        </a>
        {page ? <p className="text-muted-foreground">{page.company}: {page.shows}.</p> : null}
        <p className="break-hash">
          fingerprint <code className="font-mono text-foreground">{c.fp || "none agreed"}</code>{" "}
          <span className="text-muted-foreground">(the first 16 hex characters of the sha256 of the text they judged)</span>
        </p>
        {c.verdict === "repeat" ? <p className="text-muted-foreground">The same text was read as challenge {c.repeatOf}; this one was read as {c.readAs}.</p> : null}
      </div>
      <p className="text-muted-foreground">{challengeMeaning(c.verdict)}</p>
      <ul className="space-y-1 text-xs">
        {c.verdict === "hidden" ? (
          <>
            <li>
              Stake slashed: <strong>{gen(c.slashedAtto)}</strong>, the member&apos;s whole stake.
            </li>
            <li className={cn(mine && "text-keeps")}>
              {gen(c.bountyAtto)} paid to the challenger{mine ? " (you)" : ""} <Address value={c.challenger} className="text-xs" /> in this transaction.
            </li>
            <li>{gen(c.toDeskAtto)} into the desk&apos;s pot. The challenger&apos;s bond of {gen(c.bondAtto)} stayed in their credit.</li>
            <li>The spend after it: {c.stateAfter === "open" ? "open again, needing one more clear countersignature" : c.stateAfter}.</li>
          </>
        ) : c.verdict === "clean" ? (
          <li>
            The bond of {gen(c.bondAtto)} left the challenger&apos;s credit and was paid to the member <Address value={c.bondTo} className="text-xs" /> in this
            transaction. Nothing else moved.
          </li>
        ) : (
          <li>
            Nothing moved. The bond of {gen(c.bondAtto)} stayed in the credit of <Address value={c.challenger} className="text-xs" />
            {mine ? " (you)" : ""}.
          </li>
        )}
      </ul>
      {hash ? <TxLink hash={hash} label="See this challenge in the explorer" /> : null}
    </div>
  );
}

/** The public name field with its suggestions: the name a public register would list the member under. */
export function PublicNameField({ value, onChange, disabled, id = "public-name" }: { value: string; onChange: (v: string) => void; disabled?: boolean; id?: string }) {
  const problem = value.trim() ? publicNameProblem(value.trim()) : "";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Your public name ({LIMITS.publicName[0]} to {LIMITS.publicName[1]} characters)
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Sam Arden" disabled={disabled} autoComplete="off" />
      <Suggest options={PUBLIC_NAME_SUGGESTIONS.map((n) => ({ label: n, value: n }))} onPick={onChange} disabled={disabled} />
      <p className="text-xs text-muted-foreground">
        The name a public register would list you under, as a director, an owner or an officer. It is printed on your record and in the
        question the validators ask about a register page. The fund checks no identity: a page about somebody else with the same name is
        that register&apos;s claim, and a name no register uses means no page can name you.
      </p>
      {problem ? <p className="text-xs text-gold">{problem}</p> : null}
    </div>
  );
}

/** Shown where a version 2 call would be sent to a register that still runs version 1. */
export function VersionOneNotice({ className }: { className?: string }) {
  const version = useRead(() => readRegisterVersion(), []);
  if (version.data !== 1) return null;
  return (
    <div role="note" className={cn("rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm", className)}>
      <p className="font-medium">This register runs version 1 of the contract.</p>
      <p className="mt-1 text-muted-foreground">
        Its desks have no stakes, no hold and no register to cite, and it takes none of the version 2 calls on this page. Reading still works.
        To try version 2, deploy the contract this site serves from the{" "}
        <Link href="/deploy" className="text-primary underline-offset-4 hover:underline">
          Deploy page
        </Link>
        ; this browser then reads your own register.
      </p>
    </div>
  );
}

/** "M2 Mara Quist 0x12…ab" in one line. */
export function MemberTag({ number, name, who }: { number: string; name: string; who: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-semibold">{number}</span>
      {name ? <span>{name}</span> : null}
      <span className="font-mono text-xs text-muted-foreground" title={who}>
        {short(who)}
      </span>
    </span>
  );
}
