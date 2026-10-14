"use client";

// The frame both practice tracks draw their steps in: one numbered row per stage, one line per
// call with its transaction and where it stands, and the pill that says so in a word.

import * as React from "react";
import { Check, CircleDot, Loader2, RotateCcw } from "lucide-react";

import { TxLink } from "@/components/address";
import { Button } from "@/components/ui/button";
import type { TxStatus } from "@/lib/chain";
import { short } from "@/lib/format";
import type { ActionState, Phase } from "@/lib/track";
import { cn } from "@/lib/utils";

export type RowPhase = Phase | "recused";

const PHASE_WORD: Record<RowPhase, string> = {
  waiting: "waiting",
  checking: "reading the chain",
  signing: "signing",
  onchain: "on chain",
  done: "done",
  refused: "refused",
  stopped: "stopped",
  recused: "refused",
};
const PHASE_STYLE: Record<RowPhase, string> = {
  waiting: "border-border text-muted-foreground",
  checking: "border-primary/40 bg-primary/10 text-primary",
  signing: "border-primary/40 bg-primary/10 text-primary",
  onchain: "border-primary/40 bg-primary/10 text-primary",
  done: "border-keeps/40 bg-keeps/10 text-keeps",
  refused: "border-gold/40 bg-gold/10 text-gold",
  stopped: "border-breaks/40 bg-breaks/10 text-breaks",
  recused: "border-gold/40 bg-gold/10 text-gold",
};

export function Pill({ phase, className }: { phase: RowPhase; className?: string }) {
  const busy = phase === "checking" || phase === "signing" || phase === "onchain";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", PHASE_STYLE[phase], className)}>
      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
      {PHASE_WORD[phase]}
    </span>
  );
}

/** One numbered stage of a track. */
export function StepRow({ n, id, title, phase, active, children }: { n: number; id: string; title: string; phase: RowPhase; active: boolean; children: React.ReactNode }) {
  const finished = phase === "done" || phase === "recused";
  return (
    <li data-row={id} data-phase={phase} className={cn("flex gap-3 rounded-2xl border p-4 sm:p-5", active ? "border-primary/50 bg-primary/5" : "bg-card")}>
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          finished ? "border-keeps/50 bg-keeps/15 text-keeps" : active ? "border-primary text-primary" : "border-border text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {finished ? <Check className="size-3.5" /> : active ? <CircleDot className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            <span className="sr-only">Step {n}: </span>
            {title}
          </h2>
          <Pill phase={phase} />
        </div>
        {children}
      </div>
    </li>
  );
}

const STAGE_WORD: Record<string, string> = {
  PENDING: "pending",
  PROPOSING: "a validator is proposing the result",
  COMMITTING: "the validators are committing their votes",
  REVEALING: "the validators are revealing their votes",
  ACCEPTED: "accepted",
  FINALIZED: "finalized",
  UNDETERMINED: "the validators did not agree",
  UNKNOWN: "not listed by the network yet",
};

export function liveWords(live: TxStatus | undefined, judged: boolean): string {
  if (!live) return "sent, waiting for the network";
  const stage = STAGE_WORD[live.status] ?? live.status.toLowerCase();
  const total = live.votes.agree + live.votes.disagree + live.votes.idle;
  return judged && total > 0 ? `${stage} · ${live.votes.agree} agree, ${live.votes.disagree} disagree, ${live.votes.idle} idle` : stage;
}

/** One call: who makes it, where it stands, its transaction, and what the contract said if it said no. */
export function ActionLine({
  id,
  label,
  action,
  live,
  held,
  judged,
  onRetry,
}: {
  id: string;
  label: string;
  action: ActionState;
  live: TxStatus | undefined;
  /** a page-held key signs it, so the page offers to try again */
  held: boolean;
  judged?: boolean;
  onRetry: () => void;
}) {
  const a = action;
  const hash = a.hash || a.last;
  return (
    <li data-action={id} data-phase={a.phase} className="space-y-1 rounded-lg border bg-background/40 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-foreground/90">{label}</span>
        <span className="flex flex-wrap items-center gap-2">
          {hash ? <TxLink hash={hash} /> : null}
          <Pill phase={a.phase} />
        </span>
      </div>
      {a.phase === "onchain" ? <p className="text-muted-foreground">{liveWords(live, !!judged)}</p> : null}
      {a.phase === "checking" ? <p className="text-muted-foreground">Reading the chain first, so that nothing is sent twice.</p> : null}
      {a.phase === "done" && a.found && !a.skipped ? <p className="text-muted-foreground">Found on the chain already, so it was not sent again.</p> : null}
      {a.note ? <p className={a.phase === "done" ? "text-muted-foreground" : "text-gold"}>{a.note}</p> : null}
      {held && (a.phase === "refused" || a.phase === "stopped") ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> {a.hash ? "Check again" : "Try again"}
        </Button>
      ) : null}
    </li>
  );
}

export function WrongWallet({ expected, me }: { expected: string; me: string }) {
  return (
    <p role="alert" className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
      This practice desk was set up for {short(expected)}, and {me ? `the wallet now connected is ${short(me)}` : "no wallet is connected now"}.{" "}
      Switch back to that account to carry on, or start a new practice desk at the bottom of this page.
    </p>
  );
}
