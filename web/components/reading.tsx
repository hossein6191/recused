"use client";

// How a stored reading is shown everywhere: the verdict, the two characters the validators
// agreed on (one per branch of the pending decision), and the sentence the contract itself wrote
// from its closed phrases. Nothing a model wrote is stored, so nothing a model wrote is shown.

import * as React from "react";
import { CheckCircle2, CircleSlash, Clock, HelpCircle, History, ShieldOff } from "lucide-react";

import { Address } from "@/components/address";
import type { Phase, Reading, Verdict } from "@/lib/chain";
import { when } from "@/lib/format";
import { phaseLabel, tokenPhrase, tokenWord, verdictLabel, verdictMeaning } from "@/lib/words";
import { cn } from "@/lib/utils";

const VERDICT_STYLE: Record<string, string> = {
  clear: "border-keeps/40 bg-keeps/10 text-keeps",
  interested: "border-gold/40 bg-gold/10 text-gold",
  unclear: "border-gold/40 bg-gold/10 text-gold",
  declared: "border-gold/40 bg-gold/10 text-gold",
  late: "border-gold/40 bg-gold/10 text-gold",
  standing: "border-gold/40 bg-gold/10 text-gold",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon =
    verdict === "clear" ? CheckCircle2 : verdict === "late" ? Clock : verdict === "declared" ? ShieldOff : verdict === "standing" ? History : verdict === "unclear" ? HelpCircle : CircleSlash;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        VERDICT_STYLE[verdict] ?? "border-border text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      {verdictLabel(verdict)}
    </span>
  );
}

const TOKEN_STYLE: Record<string, string> = {
  U: "border-keeps/40 bg-keeps/10 text-keeps",
  G: "border-gold/50 bg-gold/10 text-gold",
  L: "border-gold/50 bg-gold/10 text-gold",
  "-": "border-border bg-muted text-muted-foreground",
};

/** The stored pair, one tile per branch, each with the contract's own phrase for its character. */
export function TokenPair({ value, className }: { value: string; className?: string }) {
  const branches: [string, string][] = [
    ["If the spend is carried out", value.slice(0, 1) || "-"],
    ["If it is not carried out", value.slice(1, 2) || "-"],
  ];
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {branches.map(([label, ch]) => (
        <div key={label} className="flex items-start gap-3 rounded-lg border bg-background/60 p-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md border font-mono text-base font-semibold",
              TOKEN_STYLE[ch] ?? "border-gold/50 bg-gold/10 text-gold",
            )}
            title={tokenWord(ch)}
          >
            {ch}
          </span>
          <div className="min-w-0 text-xs">
            <p className="text-muted-foreground">{label}</p>
            <p className="text-foreground">{tokenPhrase(ch)}.</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** One reading in full. `mine` marks the visitor's own. */
export function ReadingCard({ reading, mine, className }: { reading: Reading; mine?: boolean; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4 text-sm", mine && "ring-1 ring-primary/50", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold">{reading.number || "Member"}</span>
          <Address value={reading.member} className="text-xs" />
          {mine ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">you</span> : null}
        </div>
        <VerdictBadge verdict={reading.verdict} />
      </div>
      <TokenPair value={reading.value} />
      {reading.why ? (
        <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{reading.why}</blockquote>
      ) : null}
      <p className="text-xs text-muted-foreground">{verdictMeaning(reading.verdict)}</p>
      <p className="text-[11px] text-muted-foreground">
        Attempt {reading.attempt || "?"} on this spend · stored value <code className="font-mono text-foreground">{reading.value}</code> ·{" "}
        {reading.modelAsked ? "read by the validators" : "decided by the contract alone, no model asked"} · disclosure filed at
        sequence {reading.filedSeq}, spend posted at {reading.postedSeq}
        {reading.gateSeq && reading.gateSeq !== reading.postedSeq ? `, first spend to this payee at ${reading.gateSeq}` : ""}
        {reading.standsOn ? ` · the reading that stands is ${reading.standsValue} on ${reading.standsOn}` : ""}
        {reading.at ? ` · ${when(reading.at)}` : ""}
      </p>
    </div>
  );
}

const PHASE_STYLE: Record<Phase, string> = {
  notice: "border-primary/40 bg-primary/10 text-primary",
  approvals: "border-keeps/40 bg-keeps/10 text-keeps",
  overdue: "border-gold/40 bg-gold/10 text-gold",
  paid: "border-keeps/40 bg-keeps/15 text-keeps",
  expired: "border-border bg-muted text-muted-foreground",
};

export function PhaseBadge({ phase, className }: { phase: Phase; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", PHASE_STYLE[phase], className)}>
      {phaseLabel(phase)}
    </span>
  );
}

/** Two dots: how many clear countersignatures a spend has out of the two it needs. */
export function ApprovalDots({ approvals, className }: { approvals: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={`${approvals} of 2 clear countersignatures`}>
      {[0, 1].map((i) => (
        <span key={i} className={cn("size-2.5 rounded-full border", i < approvals ? "border-keeps bg-keeps" : "border-muted-foreground/50")} aria-hidden="true" />
      ))}
      <span>{approvals} of 2</span>
    </span>
  );
}
