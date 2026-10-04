"use client";

// The practice desk: one visitor, one wallet, from arriving to a judged reading and a payment.
//
// A spend needs a poster and two countersigners, and a countersigner must have enrolled before
// the spend was posted, so a visitor who arrives alone can only ever be refused as filed too
// late. This page opens a new desk and plays its other members with accounts it holds itself,
// and says so. Every step is a real transaction; the visitor's own two (the disclosure and the
// countersignature) are signed by the visitor's wallet. The script is lib/practice.ts and the
// engine that signs and follows is lib/practice-engine.ts; this file only shows the state.

import { SectionHelp } from "@/components/section-help";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDot, FileSignature, FlaskConical, Hourglass, Loader2, Play, RotateCcw, Signature, TriangleAlert } from "lucide-react";

import { Address, TxLink } from "@/components/address";
import { DisclosureForm, disclosureProblem, type Disclosure } from "@/components/disclosure-form";
import { NoRegister } from "@/components/read-state";
import { ReadingCard } from "@/components/reading";
import { Button } from "@/components/ui/button";
import { useChainSeconds } from "@/components/use-clock";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { WalletGate } from "@/components/wallet-gate";
import { LIMITS, contractAddress, isMock, readLimits, spendPath, type Reading, type TxStatus } from "@/lib/chain";
import { gen, short, span } from "@/lib/format";
import {
  CAST,
  POT_ATTO,
  ROLES,
  ROWS,
  SIGNER,
  SPEND1,
  SPEND2,
  VISITOR_DISCLOSURE,
  blocked,
  clearCount,
  firstSpendBusy,
  identification,
  reserveNeeded,
  rowPhase,
  type ActionId,
  type RowId,
  type RowPhase,
  type SpendInfo,
} from "@/lib/practice";
import * as practice from "@/lib/practice-engine";
import type { PracticeView } from "@/lib/practice-engine";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";
const link = "text-primary underline-offset-4 hover:underline";

export default function PracticePage() {
  const view = React.useSyncExternalStore(practice.subscribe, practice.snapshot, practice.serverSnapshot);
  const me = useMe();
  const hasRegister = useLocal(() => isMock || !!contractAddress(), true);
  const s = view.state;
  const started = s.startedAt > 0;

  React.useEffect(() => practice.attach(), []);
  React.useEffect(() => {
    practice.setVisitor(me.address);
  }, [me.address]);

  const now = useChainSeconds(view.clock);
  const chainNow = view.clock ? now : 0;
  const current = ROWS.find((r) => {
    const p = rowPhase(s, r.id);
    return p !== "done" && p !== "recused";
  })?.id;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">Practice desk</p>
        <h1 className="text-3xl font-bold tracking-tight">The whole of it, alone, in about ten minutes</h1>
        <p className="text-muted-foreground">
          A spend needs three members: one who posts it and two who countersign. A countersigner must have filed a disclosure
          before the spend was posted, so on a desk that already has spends a newcomer can only be refused as filed too late.
          This page opens a new desk for you and plays its other members. You file your own disclosure, countersign a spend
          posted after it, are read by the validators, and watch the fund pay.
        </p>
      </header>

      <section className={cn(card, "space-y-3 text-sm")} aria-labelledby="held-title">
        <h2 id="held-title" className="flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="size-4 text-primary" /> What the page holds, and what is yours
        <SectionHelp k="practice-accounts" />
      </h2>
        <p className="text-foreground/90">
          The page makes three practice accounts, held in this browser, playing the other members of your desk. They are not
          anybody&apos;s wallet and hold test GEN only. Their keys are made here when you press the button, kept in this
          browser&apos;s storage so that a reload carries on, and used by the page to sign their calls.
        </p>
        <ul className="space-y-1.5 text-muted-foreground">
          {ROLES.map((r) => (
            <li key={r} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-foreground">{CAST[r].name}</span>
              <span>{CAST[r].part}.</span>
              {started ? <Address value={s.addresses[r]} className="text-xs" /> : null}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          You are the only person here. Your disclosure and your countersignature are signed by your own wallet and by nothing
          else.{" "}
          {isMock
            ? "This is demo mode: the contract is an in-memory copy and its readings are scripted, as the bar above says."
            : "Every step is a real transaction on GenLayer Studio that you can open in the explorer, and nothing is decided in advance: the validators read what you actually file."}
        </p>
      </section>

      {!hasRegister ? (
        <NoRegister />
      ) : !view.loaded ? null : !started ? (
        <StartCard watching={view.watching} />
      ) : (
        <>
          {view.watching ? (
            <p role="status" className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
              This practice desk is running in another tab of this browser. This tab shows its progress and sends nothing, so
              that no step is made twice.
            </p>
          ) : null}
          <ol className="space-y-3">
            <AccountsRow view={view} active={current === "accounts"} />
            <DeskRow view={view} active={current === "desk"} />
            <EnrolRow view={view} me={me.address} active={current === "enrol"} />
            <SpendRow view={view} now={chainNow} active={current === "spend"} />
            <SignRow view={view} me={me.address} now={chainNow} active={current === "sign"} />
            <PayRow view={view} active={current === "pay"} />
            <ContrastRow view={view} now={chainNow} active={current === "contrast"} />
          </ol>
          <Afterwards view={view} />
        </>
      )}
    </div>
  );
}

// ---- before it starts -------------------------------------------------------------------------

function StartCard({ watching }: { watching: boolean }) {
  return (
    <section className={cn(card, "space-y-4")} aria-labelledby="start-title">
      <h2 id="start-title" className="text-lg font-semibold">
        Seven steps, two of them yours
        <SectionHelp k="practice-start" />
      </h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>The page makes the practice accounts and asks the test faucet for 10 test GEN each.</li>
        <li>The teacher opens a new desk with a pot of {gen(POT_ATTO)}, and the three practice members file their disclosures.</li>
        <li className="text-foreground">You file your own disclosure, with your wallet. This comes before the spend, and the page waits for it.</li>
        <li>The teacher posts a spend that pays a locksmith. Its notice window runs: five minutes, the shortest the contract takes.</li>
        <li className="text-foreground">You countersign, with your wallet. The validators read your disclosure against the spend under both branches.</li>
        <li>The print shop co-owner countersigns. If both readings are clear, that second one pays the locksmith from the pot.</li>
        <li>One more click shows the other outcome: a spend that pays the print shop, and its co-owner refused on it.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="cool" size="lg" disabled={watching} onClick={() => practice.start()}>
          <Play /> Set up my practice desk
        </Button>
        <p className="text-xs text-muted-foreground">
          About ten minutes in all, five of them the notice window. You can connect your wallet now or when step 3 asks.
        </p>
      </div>
      {watching ? (
        <p className="text-xs text-gold">Another tab of this browser has this page open and would run the same steps. Use that tab, or close it.</p>
      ) : null}
    </section>
  );
}

// ---- the row frame ------------------------------------------------------------------------------

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

function Pill({ phase, className }: { phase: RowPhase; className?: string }) {
  const busy = phase === "checking" || phase === "signing" || phase === "onchain";
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", PHASE_STYLE[phase], className)}>
      {busy ? <Loader2 className="size-3 animate-spin" /> : null}
      {PHASE_WORD[phase]}
    </span>
  );
}

function Row({ n, id, title, view, active, children }: { n: number; id: RowId; title: string; view: PracticeView; active: boolean; children: React.ReactNode }) {
  const phase = rowPhase(view.state, id);
  const finished = phase === "done" || phase === "recused";
  return (
    <li
      data-row={id}
      data-phase={phase}
      className={cn("flex gap-3 rounded-2xl border p-4 sm:p-5", active ? "border-primary/50 bg-primary/5" : "bg-card")}
    >
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
  UNKNOWN: "not listed by the network yet",
};

function liveWords(live: TxStatus | undefined, judged: boolean): string {
  if (!live) return "sent, waiting for the network";
  const stage = STAGE_WORD[live.status] ?? live.status.toLowerCase();
  const total = live.votes.agree + live.votes.disagree + live.votes.idle;
  return judged && total > 0 ? `${stage} · ${live.votes.agree} agree, ${live.votes.disagree} disagree, ${live.votes.idle} idle` : stage;
}

/** One call: who makes it, where it stands, its transaction, and what the contract said if it said no. */
function ActionLine({ id, label, view, judged }: { id: ActionId; label: string; view: PracticeView; judged?: boolean }) {
  const a = view.state.actions[id];
  const held = SIGNER[id] !== "you";
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
      {a.phase === "onchain" ? <p className="text-muted-foreground">{liveWords(view.live[id], !!judged)}</p> : null}
      {a.phase === "checking" ? <p className="text-muted-foreground">Reading the chain first, so that nothing is sent twice.</p> : null}
      {a.phase === "done" && a.found && !a.skipped ? (
        <p className="text-muted-foreground">Found on the chain already, so it was not sent again.</p>
      ) : null}
      {a.note ? <p className={a.phase === "done" ? "text-muted-foreground" : "text-gold"}>{a.note}</p> : null}
      {held && (a.phase === "refused" || a.phase === "stopped") ? (
        <Button type="button" variant="outline" size="sm" onClick={() => practice.retry(id)}>
          <RotateCcw /> {a.hash ? "Check again" : "Try again"}
        </Button>
      ) : null}
    </li>
  );
}

// ---- 1: the accounts ---------------------------------------------------------------------------------

function AccountsRow({ view, active }: { view: PracticeView; active: boolean }) {
  const s = view.state;
  const phase = rowPhase(s, "accounts");
  return (
    <Row n={1} id="accounts" title="Three practice accounts" view={view} active={active}>
      <p className="text-muted-foreground">
        {phase === "done"
          ? "Three keys were made in this browser and each account holds test GEN from Studio's faucet. Calls on Studio cost no fee; the teacher needs the GEN for the desk's pot. Next: the teacher opens a desk."
          : "The page has made three keys in this browser and is asking Studio's test faucet for 10 test GEN for each. This takes a few seconds."}
      </p>
      <ul className="space-y-1.5">
        {ROLES.map((r) => {
          const id = ("fund" + r.charAt(0).toUpperCase() + r.slice(1)) as ActionId;
          return <ActionLine key={r} id={id} view={view} label={`${CAST[r].name}, ${short(s.addresses[r])}: 10 test GEN from the faucet`} />;
        })}
      </ul>
    </Row>
  );
}

// ---- 2: the desk and its first members ---------------------------------------------------------------

function DeskRow({ view, active }: { view: PracticeView; active: boolean }) {
  const s = view.state;
  const phase = rowPhase(s, "desk");
  return (
    <Row n={2} id="desk" title="A new desk, and its first three members" view={view} active={active}>
      <p className="text-muted-foreground">
        {phase === "done" ? (
          <>
            Desk {s.desk}, named {s.label}, is open with {gen(POT_ATTO)} in its pot, and the three practice members have filed
            what is printed below. Next: your own disclosure.
          </>
        ) : (
          <>
            The teacher opens a desk named {s.label} and sends {gen(POT_ATTO)} with the call as its pot. Then each practice
            member files a disclosure, as every member of a desk must. Each call takes a few seconds to be accepted.
          </>
        )}
      </p>
      <ul className="space-y-1.5">
        <ActionLine id="open" view={view} label={`The teacher opens the desk with ${gen(POT_ATTO)}`} />
        <ActionLine id="enrolTeacher" view={view} label="The teacher files a disclosure" />
        <ActionLine id="enrolPrinter" view={view} label="The print shop co-owner files a disclosure" />
        <ActionLine id="enrolNurse" view={view} label="The night nurse files a disclosure" />
      </ul>
      <details className="rounded-lg border bg-background/40 px-3 py-2 text-xs">
        <summary className="cursor-pointer text-foreground/90">What the three practice members file</summary>
        <ul className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <li key={r} className="space-y-1">
              <p className="font-medium text-foreground">
                {CAST[r].name}
                {s.members[r] ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · member {s.members[r]!.number}, sequence number {s.members[r]!.filedSeq}
                  </span>
                ) : null}
              </p>
              <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{CAST[r].statement}</blockquote>
              {CAST[r].entries.map((e) => (
                <p key={e.name} className="text-muted-foreground">
                  <span className="text-foreground">{e.name}</span>: {e.relation.replace(/_/g, " ")}
                  {e.detail ? `. ${e.detail}` : ""}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </Row>
  );
}

// ---- 3: the visitor enrols --------------------------------------------------------------------------------

function WrongWallet({ expected, me }: { expected: string; me: string }) {
  return (
    <p role="alert" className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
      This practice desk was set up for {short(expected)}, and {me ? `the wallet now connected is ${short(me)}` : "no wallet is connected now"}.{" "}
      Switch back to that account to carry on, or start a new practice desk at the bottom of this page.
    </p>
  );
}

function EnrolRow({ view, me, active }: { view: PracticeView; me: string; active: boolean }) {
  const s = view.state;
  const a = s.actions.enrolYou;
  const limitsRead = useRead(() => readLimits(), [], { enabled: !!s.desk && a.phase !== "done" });
  const limits = limitsRead.data ?? LIMITS;
  const [value, setValue] = React.useState<Disclosure>(VISITOR_DISCLOSURE);
  const [error, setError] = React.useState("");
  const busy = a.phase === "checking" || a.phase === "signing" || a.phase === "onchain";
  const why = blocked(s, "enrolYou", 0);
  const tooLate = !!s.s1 && a.phase !== "done";

  const submit = () => {
    const p = disclosureProblem(value, limits);
    setError(p);
    if (!p) practice.enrolYou(value);
  };

  return (
    <Row n={3} id="enrol" title="You enrol, with your own wallet" view={view} active={active}>
      {a.phase === "done" && s.members.you ? (
        <>
          <p className="text-muted-foreground">
            You are member {s.members.you.number} of {s.label}, filed at sequence number {s.members.you.filedSeq} from{" "}
            <span className="font-mono">{short(s.visitor)}</span>. The spend that comes next takes a higher number, so your
            disclosure will be read against it.
          </p>
          <ul className="space-y-1.5">
            <ActionLine id="enrolYou" view={view} label="Your disclosure" />
          </ul>
          {me !== s.visitor ? <WrongWallet expected={s.visitor} me={me} /> : null}
        </>
      ) : tooLate ? (
        <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
          The spend on this practice desk is already posted, so a disclosure filed now could only be refused on it as filed too
          late. Start a new practice desk at the bottom of this page.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Why this comes before the spend</p>
            <p className="mt-1">
              The contract gives every disclosure and every spend the next number of one counter, and reads a disclosure only
              against spends with a higher number. Nobody can write or revise a disclosure after seeing what they want to
              approve. So the page does not post the spend until your disclosure is on chain; enrol afterwards and you could
              only be refused on it.
            </p>
            <p className="mt-1">
              The spend will pay a locksmith. The text below is a suggestion with nothing in it a locksmith touches. Rewrite it
              in your own words; if you put a locksmith in, expect to be recused, which is the contract working too.
            </p>
          </div>
          <DisclosureForm value={value} onChange={setValue} limits={limits} disabled={busy} />
          {error ? (
            <p role="alert" className="text-sm text-gold">
              {error}
            </p>
          ) : null}
          <WalletGate action="file your disclosure">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="cool" size="lg" disabled={busy || !!why || !me || view.watching} onClick={submit}>
                <FileSignature /> File my disclosure{s.desk ? ` on ${s.desk}` : ""}
              </Button>
              <p className="text-xs text-muted-foreground">
                {why ? `The button unlocks in a moment: ${why}.` : "One transaction from your wallet, accepted in a few seconds. Calls on Studio cost no fee."}
              </p>
            </div>
          </WalletGate>
          {a.hash || a.last || a.note || busy ? (
            <ul className="space-y-1.5">
              <ActionLine id="enrolYou" view={view} label="Your disclosure" />
            </ul>
          ) : null}
        </>
      )}
    </Row>
  );
}

// ---- the notice window -------------------------------------------------------------------------------------

function Countdown({ spend, now, label }: { spend: SpendInfo; now: number; label: string }) {
  if (!now) return <p className="text-xs text-muted-foreground">Reading the chain&apos;s clock.</p>;
  const left = spend.noticeUntil - now;
  const total = LIMITS.noticeMinutes[0] * 60;
  const share = Math.min(100, Math.max(0, ((total - left) / total) * 100));
  if (left <= 0)
    return (
      <p className="text-xs text-keeps">
        The notice window of {label} has closed and its document is sealed. Countersignatures are open for another {span(spend.windowUntil - now)}.
      </p>
    );
  return (
    <div className="space-y-2 rounded-xl border bg-background/40 p-3" data-countdown={label}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Hourglass className="size-4 text-primary" /> Countersignatures on {label} open in <span className="font-mono">{span(left)}</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full bg-primary/60" style={{ width: `${share}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Counted on the chain&apos;s own clock, not this device&apos;s. A reload carries on from where it is; the page moves on by itself.
      </p>
      {isMock ? (
        <Button type="button" variant="outline" size="sm" onClick={() => practice.skipWait()}>
          Demo mode only: skip the wait
        </Button>
      ) : null}
    </div>
  );
}

function SpendFacts({ view, which }: { view: PracticeView; which: 1 | 2 }) {
  const s = view.state;
  const info = which === 1 ? s.s1 : s.s2;
  const script = which === 1 ? SPEND1 : SPEND2;
  if (!info) return null;
  return (
    <div className="space-y-1 rounded-lg border bg-background/40 px-3 py-2 text-xs">
      <p className="text-foreground">
        S{info.n}: {gen(script.amountAtto)}, posted at sequence number {info.postedSeq}, to{" "}
        <Address value={s.addresses[script.payee]} className="text-xs" />
      </p>
      <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{script.description}</blockquote>
      <p className="text-muted-foreground">
        The payee is a fresh address, also held in this browser, that stands for {script.payeeName}. It never signs anything
        and starts at 0 GEN, so a payment is easy to see.{" "}
        <Link href={spendPath(s.desk, info.n)} className={link}>
          Open S{info.n} on its own page
        </Link>{" "}
        for the document the validators read.
      </p>
    </div>
  );
}

// ---- 4: the spend ----------------------------------------------------------------------------------------------

function SpendRow({ view, now, active }: { view: PracticeView; now: number; active: boolean }) {
  const s = view.state;
  const a = s.actions.post1;
  const open = !!s.s1 && !!now && now >= s.s1.noticeUntil;
  return (
    <Row n={4} id="spend" title="The teacher posts a spend, and its notice window runs" view={view} active={active}>
      {a.phase !== "done" ? (
        <p className="text-muted-foreground">
          {s.actions.enrolYou.phase === "done"
            ? `Your disclosure is on chain, so the teacher now posts a spend: ${gen(SPEND1.amountAtto)} to a locksmith, with the shortest notice window the contract takes.`
            : `Once your disclosure is on chain, the teacher posts a spend: ${gen(SPEND1.amountAtto)} to a locksmith, with the shortest notice window the contract takes. The page holds it back until then.`}
        </p>
      ) : (
        <p className="text-muted-foreground">
          The spend is posted
          {s.members.you && s.s1 ? `, at sequence number ${s.s1.postedSeq}, above your ${s.members.you.filedSeq}` : ""}. Its amount is set
          aside in the pot. {open ? "Next: your countersignature." : "Nobody may countersign until the notice window closes."}
        </p>
      )}
      <ul className="space-y-1.5">
        <ActionLine id="post1" view={view} label={`The teacher posts ${gen(SPEND1.amountAtto)} to the locksmith`} />
      </ul>
      <SpendFacts view={view} which={1} />
      {s.s1 && s.actions.signYou.phase !== "done" ? <Countdown spend={s.s1} now={now} label={`S${s.s1.n}`} /> : null}
      {s.s1 && !open ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">What the notice window is for</p>
          <p className="mt-1">
            It gives every member time to see a spend before anyone can approve it. While it runs, any member but the poster who
            enrolled before the spend may add one sentence saying who the payee is, so a poster cannot pass off a payment to a
            friend as a payment to a stranger. When it closes, the document the validators read is sealed: every countersigner is read
            against the same text.
          </p>
          <p className="mt-1">
            Five minutes is the shortest the contract takes, and no call can shorten it. A desk holding real money would choose
            hours or days. While you wait, the contrast in step 7 can be started, and its window then runs alongside this one.
          </p>
        </div>
      ) : null}
    </Row>
  );
}

// ---- 5: the visitor countersigns ------------------------------------------------------------------------------------

function ReadingBlock({ reading, mine }: { reading: Reading; mine?: boolean }) {
  return <ReadingCard reading={reading} mine={mine} className="bg-background/40" />;
}

function SignRow({ view, me, now, active }: { view: PracticeView; me: string; now: number; active: boolean }) {
  const s = view.state;
  const a = s.actions.signYou;
  const reading = s.readings.you;
  const busy = a.phase === "checking" || a.phase === "signing" || a.phase === "onchain";
  const why = blocked(s, "signYou", now);
  const wrong = !!s.visitor && me !== s.visitor;
  return (
    <Row n={5} id="sign" title="You countersign, and the validators read you" view={view} active={active}>
      {reading ? (
        <>
          <p className="text-muted-foreground">
            {reading.verdict === "clear"
              ? "The validators agreed that nothing you filed moves whether this spend is carried out or not. Your countersignature counts: 1 of 2. No money has moved. Next: the print shop co-owner."
              : reading.modelAsked
                ? "The validators did not read you as clear, so the contract refused your countersignature and published the reading. That is final for you on this spend and it is not a finding against you. Two other members can still carry the spend, and the page's members will try."
                : "The contract refused your countersignature by itself, with no model asked, and published the refusal. Two other members can still carry the spend, and the page's members will try."}
          </p>
          <ul className="space-y-1.5">
            <ActionLine id="signYou" view={view} label="Your countersignature" judged />
          </ul>
          <ReadingBlock reading={reading} mine />
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            One transaction from your wallet. Each validator asks its own model the same question under both branches of the
            decision: what happens to what you filed if this spend is carried out, and what happens if it is not. They must
            agree on two characters, one per branch. It usually takes one to two minutes, and whatever comes back is stored and
            final: one attempt per member per spend.
          </p>
          {s.s1 && s.members.you ? (
            wrong ? (
              <WrongWallet expected={s.visitor} me={me} />
            ) : (
              <WalletGate action="countersign">
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="cool" size="lg" disabled={busy || !!why || view.watching} onClick={() => practice.signYou()}>
                    <Signature /> Countersign S{s.s1.n}
                  </Button>
                  {why ? <p className="text-xs text-muted-foreground">Not yet: {why}.</p> : null}
                </div>
              </WalletGate>
            )
          ) : null}
          {a.hash || a.last || a.note || busy ? (
            <ul className="space-y-1.5">
              <ActionLine id="signYou" view={view} label="Your countersignature" judged />
            </ul>
          ) : null}
        </>
      )}
    </Row>
  );
}

// ---- 6: the second countersignature and the payment -------------------------------------------------------------------

function PayRow({ view, active }: { view: PracticeView; active: boolean }) {
  const s = view.state;
  const reserve = reserveNeeded(s) || s.actions.signNurse.phase !== "waiting";
  const settled = s.actions.signPrinter.phase === "done" && (!reserve || s.actions.signNurse.phase === "done");
  const balance = view.balances.locksmith;
  const landed = !!s.paid && balance !== "" && BigInt(balance) >= BigInt(s.paid.atto || "0");
  return (
    <Row n={6} id="pay" title="The print shop co-owner countersigns, and the fund pays" view={view} active={active}>
      {!s.readings.printer ? (
        <p className="text-muted-foreground">
          After your reading, the print shop co-owner countersigns the same spend. That member filed a print shop, and this
          spend pays a locksmith, so nothing they filed should move. A second clear reading pays the payee in that same
          transaction; the contract never pays on one.
        </p>
      ) : s.paid ? (
        <p className="text-foreground/90">
          Paid. The second clear countersignature sent {gen(s.paid.atto)} from the pot to <span className="font-mono">{short(s.paid.to)}</span>{" "}
          in its own transaction, after the spend was marked paid
          {s.paid.potAtto ? `. The pot now holds ${gen(s.paid.potAtto)}` : ""}.
        </p>
      ) : settled ? (
        <p className="text-foreground/90">
          The spend has {clearCount(s)} clear {clearCount(s) === 1 ? "reading" : "readings"} from the three members who could give
          one, and it needs two, so it stays unpaid and will expire when its window ends. The money stays in the pot. That is
          the contract working: a reading is final, and it never pays on one signature. A new practice desk gives a fresh run.
        </p>
      ) : (
        <p className="text-muted-foreground">
          The spend has {clearCount(s)} clear {clearCount(s) === 1 ? "reading" : "readings"} so far and needs two.
          {reserve ? " The night nurse, held in reserve for exactly this, now countersigns." : ""}
        </p>
      )}
      <ul className="space-y-1.5">
        <ActionLine id="signPrinter" view={view} label="The print shop co-owner countersigns" judged />
        {reserve ? <ActionLine id="signNurse" view={view} label="The night nurse countersigns, from reserve" judged /> : null}
      </ul>
      {s.readings.printer ? <ReadingBlock reading={s.readings.printer} /> : null}
      {s.readings.nurse ? <ReadingBlock reading={s.readings.nurse} /> : null}
      {s.paid ? (
        <div className={cn("space-y-1 rounded-xl border p-3 text-xs", landed ? "border-keeps/40 bg-keeps/10" : "bg-background/40")} data-payment={landed ? "landed" : "pending"}>
          <p className="text-sm font-medium text-foreground">
            {landed ? `The money has arrived: the payee's balance reads ${gen(balance)}.` : `The payee's balance reads ${balance === "" ? "…" : gen(balance)}; the transfer is on its way.`}
          </p>
          <p className="text-muted-foreground">
            A transfer leaves when its transaction is finalized, about half a minute after it is accepted. The page reads the
            payee&apos;s balance from the network every three seconds until it moves.{" "}
            <Address value={s.paid.to} className="text-xs" />
          </p>
        </div>
      ) : null}
    </Row>
  );
}

// ---- 7: the contrast ------------------------------------------------------------------------------------------------------

function ContrastRow({ view, now, active }: { view: PracticeView; now: number; active: boolean }) {
  const s = view.state;
  const reading = s.readings.contrast;
  const canAsk = s.actions.post1.phase === "done";
  const printerNumber = s.members.printer?.number ?? "";
  return (
    <Row n={7} id="contrast" title="The contrast: a spend that pays the print shop" view={view} active={active}>
      {!s.contrast ? (
        <>
          <p className="text-muted-foreground">
            The first spend shows readings that come back clear. This one shows the refusal the contract exists for. The teacher
            posts a second spend, {gen(SPEND2.amountAtto)} for printing at Pelican Press. The print shop co-owner, who filed that
            shop as partly their own, countersigns it and is read by the validators like anybody else.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="cool" disabled={!canAsk || view.watching} onClick={() => practice.askContrast()}>
              <Play /> Post the print shop spend
            </Button>
            <p className="text-xs text-muted-foreground">
              {canAsk
                ? "One click. Its notice window is five minutes too; press it while the first one runs and they run side by side."
                : "Available as soon as the first spend is posted."}
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            {!reading
              ? "The teacher posts the print shop spend, the night nurse says in one sentence who its payee is, and once the notice window closes the print shop co-owner countersigns. Nothing more is needed from you."
              : reading.verdict === "clear"
                ? "This reading came back clear, which is not what the part owner of the payee should get. The page shows what the validators stored and does not dress it up: the contract reads what was filed, and a reading can miss."
                : reading.verdict === "interested"
                  ? "Refused, and published. The validators agreed that something this member filed moves with the spend, so the countersignature does not count and no money moved. It is not a finding against the member: it is their own disclosure doing its job. Two other members could still carry this spend."
                  : "Refused, and published. The reading did not come back as nothing moved under both branches, so the countersignature does not count and no money moved. A reading that is unsettled is stored as what it is and never rounded to clear."}
          </p>
          <ul className="space-y-1.5">
            <ActionLine id="post2" view={view} label={`The teacher posts ${gen(SPEND2.amountAtto)} to the print shop's till`} />
            {s.s2 ? <ActionLine id="identify2" view={view} label="The night nurse says who the payee is" /> : null}
            {s.s2 ? <ActionLine id="sign2" view={view} label="The print shop co-owner countersigns" judged /> : null}
          </ul>
          <SpendFacts view={view} which={2} />
          {s.s2 && s.actions.identify2.phase === "done" && !s.actions.identify2.skipped ? (
            <p className="rounded-lg border bg-background/40 px-3 py-2 text-xs text-foreground/90">{identification(printerNumber)}</p>
          ) : null}
          {s.s2 && !reading ? <Countdown spend={s.s2} now={now} label={`S${s.s2.n}`} /> : null}
          {s.s2 && !reading && !!now && now >= s.s2.noticeUntil && firstSpendBusy(s) ? (
            <p className="text-xs text-muted-foreground">
              The print shop co-owner makes one call at a time. The first spend is being carried, so that countersignature goes
              first and this one follows it.
            </p>
          ) : null}
          {reading ? <ReadingBlock reading={reading} /> : null}
          {reading && s.s2 ? (
            <p className="text-xs text-muted-foreground">
              You enrolled before this spend too, so you may countersign it yourself on{" "}
              <Link href={spendPath(s.desk, s.s2.n)} className={link}>
                its own page
              </Link>
              . Left alone, it expires when its window ends and the money stays in the pot.
            </p>
          ) : null}
        </>
      )}
    </Row>
  );
}

// ---- afterwards -------------------------------------------------------------------------------------------------------------

function Afterwards({ view }: { view: PracticeView }) {
  const s = view.state;
  const [sure, setSure] = React.useState(false);
  const finished = !!s.readings.you && s.actions.signPrinter.phase === "done";
  return (
    <section className={cn(card, "space-y-3 text-sm")} aria-labelledby="after-title">
      <h2 id="after-title" className="text-lg font-semibold">
        {finished ? "What you have just seen" : "While it runs"}
        <SectionHelp k="practice-after" />
      </h2>
      {finished ? (
        <p className="text-muted-foreground">
          A disclosure filed before a spend, a countersignature read under both branches, and money that moved only when two
          members were read clear. {s.readings.contrast ? "And a member refused on a spend that pays their own shop." : "Step 7 shows the refusal."}
        </p>
      ) : (
        <p className="text-muted-foreground">
          You can leave this page and come back, or reload it: the practice desk is kept in this browser, and before any step is
          sent again the page reads the chain to see whether it already landed.
        </p>
      )}
      {s.desk ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/desk?desk=${s.desk}`}>
              Open {s.desk} on the desk page <ArrowRight />
            </Link>
          </Button>
          {s.s1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={spendPath(s.desk, s.s1.n)}>
                S{s.s1.n} in full <ArrowRight />
              </Link>
            </Button>
          ) : null}
          {s.s2 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={spendPath(s.desk, s.s2.n)}>
                S{s.s2.n} in full <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        {!sure ? (
          <Button type="button" variant="ghost" size="sm" disabled={view.watching} onClick={() => setSure(true)}>
            <RotateCcw /> Start a new practice desk
          </Button>
        ) : (
          <>
            <p className="flex items-start gap-1.5 text-xs text-gold">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              This forgets the practice accounts and this desk in this browser. What is on chain stays on chain.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSure(false);
                practice.reset();
              }}
            >
              Forget it and start again
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSure(false)}>
              Keep it
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
