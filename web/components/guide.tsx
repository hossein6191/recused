"use client";

// The guide a first-time visitor follows on the home page. Each step is read from live state
// (the wallet, its balance, and this address's own disclosure and readings on the desk), so the
// step marked "now" is the one that actually comes next and its button opens the page for it.
// A failed read shows the error with its retry; no step is marked "now" on a guess.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDot, FlaskConical, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BlockSkeleton, NoRegister, ReadError } from "@/components/read-state";
import { VerdictBadge } from "@/components/reading";
import { useChainSeconds } from "@/components/use-clock";
import { useDeskId } from "@/components/use-desk";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { useWallet, WalletButton } from "@/components/wallet";
import {
  contractAddress,
  faucet,
  isMock,
  phaseOf,
  readDesk,
  readMember,
  readReading,
  readReadings,
  readSpend,
  readSpends,
  spendPath,
  type Desk,
  type Member,
  type ReadResult,
  type Reading,
  type Spend,
  type Stamped,
} from "@/lib/chain";
import { gen, span } from "@/lib/format";
import { lastReading } from "@/lib/register";
import { cn } from "@/lib/utils";

/** How many of the newest open spends the guide reads (two view calls each at most). */
const OPEN_SPENDS_READ = 3;

type Target = { spend: Spend; eligible: boolean };

type Progress = Stamped & {
  desk: Desk | null;
  member: Member | null;
  openCount: number;
  /** open spends this address could still countersign: not its own, no reading yet */
  targets: Target[];
  /** an open spend this address posted itself */
  own: Spend | null;
  /** this address's newest stored reading, with the spend it is on */
  mine: { reading: Reading; n: number } | null;
};

async function readProgress(deskId: string, address: string): Promise<ReadResult<Progress>> {
  const desk = await readDesk(deskId);
  const base = { chainNow: desk.data?.chainNow ?? 0, readAtMs: desk.data?.readAtMs ?? 0 };
  if (!desk.data || !address)
    return { data: { ...base, desk: desk.data, member: null, openCount: desk.data?.openSpends ?? 0, targets: [], own: null, mine: null }, source: desk.source };
  const [member, list] = await Promise.all([readMember(deskId, address), readSpends(deskId)]);
  const open = list.data.rows.filter((s) => s.state === "open").reverse();
  const targets: Target[] = [];
  let own: Spend | null = null;
  let mine: Progress["mine"] = null;
  if (member.data) {
    for (const row of open.slice(0, OPEN_SPENDS_READ)) {
      const spend = (await readSpend(deskId, row.n)).data;
      if (!spend) continue;
      if (spend.poster === address) {
        own = own ?? spend;
        continue;
      }
      const readings = row.attempts > 0 ? (await readReadings(deskId, row.n)).data : [];
      const r = readings.find((x) => x.member === address);
      if (r) mine = mine ?? { reading: r, n: row.n };
      // Late is measured against the gate: the first spend posted to this payee and not since paid.
      else targets.push({ spend, eligible: member.data.filedSeq < spend.gateSeq });
    }
    if (!mine) {
      const n = lastReading(deskId, address);
      if (n > 0) {
        const r = (await readReading(deskId, n, address)).data;
        if (r) mine = { reading: r, n };
      }
    }
  }
  return {
    data: { chainNow: list.data.chainNow || base.chainNow, readAtMs: list.data.readAtMs || base.readAtMs, desk: desk.data, member: member.data, openCount: open.length, targets, own, mine },
    source: desk.source,
  };
}

type Step = { title: string; done: boolean; body: React.ReactNode };

const link = "text-primary underline-offset-4 hover:underline";

export function Guide({ className }: { className?: string }) {
  const w = useWallet();
  const me = useMe();
  const deskId = useDeskId();
  const hasRegister = useLocal(() => isMock || !!contractAddress(), true);
  const [funding, setFunding] = React.useState(false);
  const [fundError, setFundError] = React.useState("");

  const progress = useRead(() => readProgress(deskId, me.address), [deskId, me.address], { enabled: hasRegister });
  const now = useChainSeconds(progress.data);
  const p = progress.data;

  const getGen = async () => {
    setFunding(true);
    setFundError("");
    try {
      if (isMock) await faucet(me.address);
      else await w.getTestGen();
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "The faucet did not answer.");
    } finally {
      setFunding(false);
    }
  };

  const connected = !!me.address;
  const funded = me.balanceAtto > 0n;
  const enrolled = !!p?.member;
  const signed = !!p?.mine;

  // The spend to send the visitor to: one the validators will read first, then one they can
  // only be refused on (a disclosure newer than the spend), which is still a real outcome.
  const approvable = (t: Target) => phaseOf(t.spend, now) === "approvals";
  const judged = p?.targets.find((t) => t.eligible && approvable(t)) ?? null;
  const waiting = p?.targets.find((t) => t.eligible && phaseOf(t.spend, now) === "notice") ?? null;
  const late = p?.targets.find((t) => !t.eligible && approvable(t)) ?? null;
  const lateWaiting = p?.targets.find((t) => !t.eligible && phaseOf(t.spend, now) === "notice") ?? null;

  let countersign: React.ReactNode;
  if (!enrolled) {
    countersign = <p>Once your disclosure is on file, this step names the spend to open.</p>;
  } else if (judged) {
    countersign = (
      <>
        <p>
          {judged.spend.label} ({gen(judged.spend.amountAtto)}) is open for countersignatures and was posted after your
          disclosure, so the validators will read it against what you filed. One transaction, usually one to two minutes.
        </p>
        <Button asChild variant="cool" size="sm">
          <Link href={spendPath(deskId, judged.spend.n)}>
            Open {judged.spend.label} and countersign <ArrowRight />
          </Link>
        </Button>
      </>
    );
  } else if (waiting) {
    countersign = (
      <>
        <p>
          {waiting.spend.label} was posted after your disclosure and is in its notice window for another{" "}
          {span(waiting.spend.noticeUntil - now)}. Nobody may countersign until it closes. Until then you may add one
          sentence saying who the payee is.
        </p>
        <Button asChild variant="cool" size="sm">
          <Link href={spendPath(deskId, waiting.spend.n)}>
            Open {waiting.spend.label} <ArrowRight />
          </Link>
        </Button>
      </>
    );
  } else if (late || lateWaiting) {
    const t = (late ?? lateWaiting)!;
    countersign = (
      <>
        <p>
          Every open spend on this desk was posted before you filed your disclosure. Countersigning {t.spend.label} will be
          refused on sequence order alone, with no model asked. That is the rule working and not a fault: nobody may write
          a disclosure after seeing the spend they want to approve. It is a real, recorded outcome and it takes one
          transaction, under a minute
          {late ? "" : `, once its notice window closes in ${span(t.spend.noticeUntil - now)}`}.
        </p>
        <p>
          For a reading by the validators you need a spend posted after you enrolled. The practice desk gives you one
          without waiting for anybody: it opens a new desk, plays the other members, and posts the spend once your
          disclosure is on chain. Here, the other way is to wait for another member to post one.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="cool" size="sm">
            <Link href="/practice">
              Open the practice desk <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={spendPath(deskId, t.spend.n)}>See the refusal on {t.spend.label}</Link>
          </Button>
        </div>
      </>
    );
  } else if (p?.own) {
    countersign = (
      <>
        <p>
          The open spend on this desk, {p.own.label}, is the one you posted, and a poster never countersigns their own. It
          needs two other members. You can watch it from its page. To countersign a spend yourself without waiting for
          anybody, use the{" "}
          <Link href="/practice" className={link}>
            practice desk
          </Link>
          .
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={spendPath(deskId, p.own.n)}>
            Open {p.own.label} <ArrowRight />
          </Link>
        </Button>
      </>
    );
  } else {
    countersign = (
      <>
        <p>
          No spend is open on this desk right now. Any member may post one once the desk has three members and free money;
          two other members then countersign it, never the poster. Posting takes one transaction, under a minute, and the
          shortest notice window is five minutes. To be read on a spend yourself without waiting for anybody, use the{" "}
          <Link href="/practice" className={link}>
            practice desk
          </Link>
          .
        </p>
        <Button asChild variant="cool" size="sm">
          <Link href="/spend/new">
            Post a spend <ArrowRight />
          </Link>
        </Button>
      </>
    );
  }

  const steps: Step[] = [
    {
      title: isMock ? "Pick a demo account" : "Connect a wallet",
      done: connected,
      body: isMock ? (
        <p>Demo mode has no wallet. Use the bar under the header to act as a newcomer or as one of the five members.</p>
      ) : (
        <>
          <p>Any browser wallet works. The site adds GenLayer Studio (chain 61999) to it and signs nowhere else.</p>
          <WalletButton />
        </>
      ),
    },
    {
      title: "Get test GEN",
      // Calls on Studio cost no fee, so a member who is already enrolled is past this step.
      done: connected && (funded || enrolled),
      body: (
        <>
          <p>
            Studio is a test network and its faucet is free: 10 test GEN, credited in a few seconds. Calls cost no fee; the
            GEN is for funding a desk or opening your own.
          </p>
          <Button type="button" variant="cool" size="sm" disabled={!connected || funding} onClick={() => void getGen()}>
            {funding ? <Loader2 className="animate-spin" /> : null} {funding ? "Waiting for the faucet" : "Get 10 test GEN"}
          </Button>
          {fundError ? <p className="text-xs text-gold">{fundError}</p> : null}
        </>
      ),
    },
    {
      title: "File your disclosure",
      done: enrolled,
      body: (
        <>
          <p>
            Say what you do, name at least one counterparty or activity, and declare any address that is yours. The contract
            stamps it with a sequence number. One transaction, under a minute.
          </p>
          <Button asChild variant="cool" size="sm">
            <Link href="/enrol">
              Enrol on {p?.desk?.label || deskId} <ArrowRight />
            </Link>
          </Button>
        </>
      ),
    },
    { title: "Countersign a spend", done: signed, body: countersign },
    {
      title: "See the outcome",
      done: signed,
      body: <p>The spend page shows the two characters the validators stored, the sentence the contract wrote, and the payment when the second clear countersignature lands.</p>,
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <section className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)} aria-labelledby="guide-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="guide-title" className="text-lg font-semibold">
          Your way through, step by step
        </h2>
        <p className="text-xs text-muted-foreground">
          Read live from {isMock ? "the demo contract" : "the chain"} for desk {deskId}
          {p?.desk ? `, ${p.desk.label}` : ""}.
        </p>
      </div>

      {hasRegister ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <FlaskConical className="size-4 shrink-0 text-primary" /> Here on your own? Start with the practice desk.
            </p>
            <p className="mt-1 text-muted-foreground">
              A spend needs a poster and two countersigners who enrolled before it, so on a desk with spends already posted a
              newcomer can only be refused as filed too late. The practice desk opens a new desk and plays the other members:
              you reach a judged reading and a real payment alone, in about ten minutes. The steps below are for joining a
              desk other people are on.
            </p>
          </div>
          <Button asChild variant="cool" size="sm" className="shrink-0">
            <Link href="/practice">
              Open the practice desk <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}

      {!hasRegister ? (
        <NoRegister className="mt-4" />
      ) : progress.loading && !p ? (
        <BlockSkeleton lines={5} className="mt-4 border-0 bg-transparent p-0" />
      ) : progress.error && !p ? (
        <ReadError className="mt-4" onRetry={progress.retry} detail={progress.error} />
      ) : p && !p.desk ? (
        <div className="mt-4 space-y-3 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="font-medium">This register has no desk {deskId} yet.</p>
          <p className="text-muted-foreground">
            A desk is opened by whoever funds it first, with one transaction. Open one, and this guide follows you through it.
          </p>
          <Button asChild variant="cool" size="sm">
            <Link href="/desk">
              Open a desk <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => {
            const isNow = i === current;
            return (
              <li
                key={s.title}
                className={cn(
                  "flex gap-3 rounded-xl border p-3 sm:p-4",
                  isNow ? "border-primary/50 bg-primary/5" : "border-border bg-background/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    s.done ? "border-keeps/50 bg-keeps/15 text-keeps" : isNow ? "border-primary text-primary" : "border-border text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {s.done ? <Check className="size-3.5" /> : isNow ? <CircleDot className="size-3.5" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <p className="font-medium">
                    {s.title}
                    {s.done ? <span className="ml-2 text-xs font-normal text-keeps">done</span> : isNow ? <span className="ml-2 text-xs font-normal text-primary">now</span> : null}
                  </p>
                  {s.done ? (
                    <DoneLine index={i} me={me.address} balance={me.balanceAtto} progress={p} deskId={deskId} />
                  ) : isNow ? (
                    <div className="space-y-2 text-muted-foreground">{s.body}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {p?.mine ? (
        <p className="mt-4 text-sm text-muted-foreground">
          That is the whole journey. From here you can{" "}
          <Link href="/spend/new" className={link}>
            post a spend
          </Link>
          ,{" "}
          <Link href="/enrol" className={link}>
            amend your disclosure
          </Link>{" "}
          (it then counts for later spends only), or{" "}
          <Link href="/deploy" className={link}>
            deploy your own copy
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}

/** What a finished step established, in one line. */
function DoneLine({ index, me, balance, progress, deskId }: { index: number; me: string; balance: bigint; progress: Progress | null; deskId: string }) {
  if (index === 0) return <p className="break-hash font-mono text-xs text-muted-foreground">{me}</p>;
  if (index === 1)
    return (
      <p className="text-xs text-muted-foreground">
        Balance {gen(balance)}.{balance > 0n ? "" : " Calls cost no fee, so you could enrol without it; GEN is only needed to fund a desk."}
      </p>
    );
  if (index === 2 && progress?.member)
    return (
      <p className="text-xs text-muted-foreground">
        You are member {progress.member.number} of {progress.desk?.label || deskId}, filed at sequence number{" "}
        {progress.member.filedSeq} (version {progress.member.version}). It is read against spends posted after that number.
      </p>
    );
  if (index >= 3 && progress?.mine) {
    const { reading, n } = progress.mine;
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span>Your countersignature on S{n}:</span>
          <VerdictBadge verdict={reading.verdict} />
          <code className="font-mono text-foreground">{reading.value}</code>
        </div>
        {index === 4 ? (
          <>
            <p className="text-foreground/90">{reading.why}</p>
            <Link href={spendPath(deskId, n)} className={link}>
              Open S{n} to see the document, every reading and the payment
            </Link>
          </>
        ) : null}
      </div>
    );
  }
  return null;
}
