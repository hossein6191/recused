"use client";

// Post a spend: payee, amount, description and the two windows, with every cap the contract
// enforces shown beside the field it applies to, and a plain statement of what posting sets in
// motion before the visitor signs.

import { SectionHelp } from "@/components/section-help";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Send, Wand2 } from "lucide-react";

import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { TxBlock } from "@/components/tx-block";
import { Button } from "@/components/ui/button";
import { Suggest } from "@/components/suggest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDeskId } from "@/components/use-desk";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { succeeded, useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { LIMITS, calls, postedSpend, readDesk, readLimits, readMember, spendPath, textProblem, type Desk, type Limits, type Member } from "@/lib/chain";
import { gen, minutesLabel, toAtto, when } from "@/lib/format";
import { isAddress } from "@/lib/register";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";

export default function NewSpendPage() {
  const deskId = useDeskId();
  const me = useMe();
  const desk = useRead(() => readDesk(deskId), [deskId]);
  const member = useRead(() => readMember(deskId, me.address), [deskId, me.address], { enabled: !!me.address && !!desk.data });
  const limitsRead = useRead(() => readLimits(), [], { enabled: !!desk.data });
  const limits = limitsRead.data ?? LIMITS;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Post a spend</h1>
        <p className="text-muted-foreground">
          Any member may ask the desk to pay somebody. The spend is paid when two other members countersign it and both read
          clear; you, as its poster, never countersign it yourself.
        </p>
      </div>

      <ReadBlock
        state={desk}
        skeleton={<BlockSkeleton lines={4} />}
        empty={
          <div className={cn(card, "space-y-3")}>
            <p className="font-medium">This register has no desk {deskId} yet.</p>
            <p className="text-sm text-muted-foreground">A spend is posted on a desk. Opening one takes one transaction.</p>
            <Button asChild variant="cool" size="sm">
              <Link href="/desk">
                Open a desk <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      >
        {(d) => (
          <>
            <div className={cn(card, "space-y-1 text-sm")}>
              <p className="text-xs font-semibold tracking-widest text-primary uppercase">Desk {d.id}</p>
              <p className="text-lg font-semibold break-words">{d.label}</p>
              <p className="text-muted-foreground">
                {gen(d.freeAtto)} free of {gen(d.potAtto)} · {d.members} members · {d.openSpends} of {limits.openSpendsPerDesk} open
                spends
                {member.data ? ` · ${member.data.openPosted} of the ${limits.openSpendsPerPoster} you may have open yourself` : ""} ·{" "}
                <Link href="/desk" className="text-primary underline-offset-4 hover:underline">
                  change desk
                </Link>
              </p>
            </div>
            <WalletGate action="post a spend">
              {member.loading && !member.data ? (
                <BlockSkeleton lines={5} />
              ) : member.error && !member.data ? (
                <ReadError onRetry={member.retry} detail={member.error} />
              ) : (
                <SpendForm desk={d} member={member.data} me={me.address} limits={limits} onPosted={() => void desk.refresh()} />
              )}
            </WalletGate>
          </>
        )}
      </ReadBlock>
    </div>
  );
}

/** Why the desk cannot take a spend from this visitor right now, with the way forward; null when it can. */
function blocker(desk: Desk, member: Member | null, limits: Limits): { text: string; href: string; cta: string } | null {
  if (!member)
    return {
      text: "Only a member of this desk may post a spend on it. Enrolling is filing your own disclosure: one transaction, under a minute.",
      href: "/enrol",
      cta: "Enrol first",
    };
  if (desk.members < limits.membersToPost)
    return {
      text: `This desk has ${desk.members} ${desk.members === 1 ? "member" : "members"}. A spend needs its poster and two other members to countersign it, so a desk takes spends from ${limits.membersToPost} members onwards. ${limits.membersToPost - desk.members} more must enrol; nothing is needed from you until then.`,
      href: "/desk",
      cta: "See the desk",
    };
  if (desk.openSpends >= limits.openSpendsPerDesk)
    return {
      text: `This desk already has ${limits.openSpendsPerDesk} open spends, the most it takes. One must be carried or expire first.`,
      href: "/desk",
      cta: "See the open spends",
    };
  if (member.openPosted >= limits.openSpendsPerPoster)
    return {
      text: `You already have ${limits.openSpendsPerPoster} spends of your own open on this desk, the most one member may hold, so that no single member can fill the desk. One of yours must be carried or expire first.`,
      href: "/desk",
      cta: "See the open spends",
    };
  if (BigInt(desk.freeAtto) <= 0n)
    return {
      text: "Every GEN this desk holds is committed to an open spend, or the pot is empty. Somebody must fund the desk before a new spend can be posted; anyone may.",
      href: "/desk",
      cta: "Fund the desk",
    };
  return null;
}

function SpendForm({ desk, member, me, limits, onPosted }: { desk: Desk; member: Member | null; me: string; limits: Limits; onPosted: () => void }) {
  const [payee, setPayee] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  // The desk's own floor, fixed when it was opened, is never below the contract's.
  const leastNotice = Math.max(limits.noticeMinutes[0], desk.minNoticeMinutes);
  const [notice, setNotice] = React.useState(String(leastNotice));
  const [live, setLive] = React.useState("60");
  const [error, setError] = React.useState("");
  const tx = useTx(() => onPosted());
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const posted = tx.final && succeeded(tx.final) ? postedSpend(tx.final) : null;

  const stop = blocker(desk, member, limits);
  const noticeMin = Math.trunc(Number(notice));
  const liveMin = Math.trunc(Number(live));
  const windowMin = noticeMin + liveMin;
  const payeeLower = payee.trim().toLowerCase();
  const declaredPayee = !!member && isAddress(payeeLower) && member.declared.includes(payeeLower);

  if (stop)
    return (
      <div className={cn(card, "space-y-3 text-sm")}>
        <p className="text-foreground/90">{stop.text}</p>
        <Button asChild variant="cool" size="sm">
          <Link href={stop.href}>
            {stop.cta} <ArrowRight />
          </Link>
        </Button>
      </div>
    );

  /** Whole spends to start from. The payee is a plain address nobody on this desk is likely to hold. */
  const SPEND_IDEAS: { label: string; value: { payee: string; amount: string; description: string } }[] = [
    {
      label: "Tables for the meeting room",
      value: {
        payee: "0x00000000000000000000000000000000000a11ce",
        amount: "2",
        description: "Two folding tables and a kettle for the monthly residents' meeting in the basement room, bought from Harbour Hardware.",
      },
    },
    {
      label: "A new lock for the bike store",
      value: {
        payee: "0x0000000000000000000000000000000000b10c4e",
        amount: "1",
        description: "A new lock and two keys for the shared bike store, fitted by Castle Locksmiths on Mill Lane.",
      },
    },
    {
      label: "Printing the annual report",
      value: {
        payee: "0x000000000000000000000000000000000009a9e2",
        amount: "3",
        description: "Printing 500 copies of the annual report at Pelican Press, the print shop on Quay Street.",
      },
    },
    {
      label: "Seeds for the shared garden",
      value: {
        payee: "0x0000000000000000000000000000000000005eed",
        amount: "0.5",
        description: "Seed, compost and two trowels for the shared garden beds, paid to the residents' gardening club.",
      },
    },
  ];
  const pickSpend = (v: { payee: string; amount: string; description: string }) => {
    setPayee(v.payee);
    setAmount(v.amount);
    setDescription(v.description);
    setNotice(String(leastNotice));
    setLive("60");
  };

  const submit = () => {
    setError("");
    if (!isAddress(payeeLower)) return setError("The payee is a 0x address of 40 hexadecimal characters.");
    if (payeeLower === me) return setError("A member paying their own address needs no reading at all, so the desk does not take it. Name another payee.");
    let value: bigint;
    try {
      value = toAtto(amount);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Enter an amount.");
    }
    if (value <= 0n) return setError("The amount must be greater than zero.");
    if (value > BigInt(desk.freeAtto)) return setError(`The desk has ${gen(desk.freeAtto)} free, and this spend asks ${gen(value)}.`);
    const p = textProblem(description.trim(), limits.description[0], limits.description[1], "The description");
    if (p) return setError(p);
    if (!(noticeMin >= leastNotice && noticeMin <= limits.noticeMinutes[1]))
      return setError(`The notice window on this desk is ${leastNotice} to ${limits.noticeMinutes[1]} minutes.`);
    if (!(liveMin >= limits.liveMinutes)) return setError(`Countersignatures must stay open for at least ${limits.liveMinutes} minutes after the notice window.`);
    if (windowMin > limits.windowMinutes) return setError(`The two windows together may not pass ${limits.windowMinutes} minutes (${minutesLabel(limits.windowMinutes)}).`);
    void tx.start(calls.postSpend(desk.id, payeeLower, value, description, noticeMin, windowMin));
  };

  return (
    <section className={cn(card, "space-y-5")} aria-labelledby="spend-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="spend-title" className="text-lg font-semibold">
          The spend
        <SectionHelp k="spendnew-form" />
      </h2>
      </div>
      <div className="space-y-2 rounded-xl border border-brand/25 bg-brand/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Wand2 className="size-3.5 text-brand" /> Fill the whole spend from an example, then change what you like
        </p>
        <Suggest label="Start with" options={SPEND_IDEAS} onPick={pickSpend} disabled={busy || !!posted} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="payee">Payee address</Label>
        <Input id="payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x followed by 40 hexadecimal characters" className="font-mono text-xs" disabled={busy || !!posted} />
        <p className="text-xs text-muted-foreground">
          Not your own address and not the contract&apos;s. The contract knows only the address: who it belongs to is what you
          write below and what other members add during the notice window.
        </p>
        {declaredPayee ? (
          <p className="text-xs text-gold">
            This is an address you declared as your own. That is allowed, and the judged document will carry a line saying so.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="amount">Amount (GEN)</Label>
          <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="2" disabled={busy || !!posted} />
          <Suggest label="" options={["0.5", "1", "2", "5"].map((a) => ({ label: a + " GEN", value: a }))} onPick={setAmount} disabled={busy || !!posted} />
          <p className="text-xs text-muted-foreground">At most the {gen(desk.freeAtto)} that is free.</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="notice">Notice window (minutes)</Label>
          <Input id="notice" value={notice} onChange={(e) => setNotice(e.target.value)} inputMode="numeric" disabled={busy || !!posted} />
          <p className="text-xs text-muted-foreground">
            {leastNotice} to {limits.noticeMinutes[1]} on this desk. Nobody may countersign until it ends.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="live">Then open for (minutes)</Label>
          <Input id="live" value={live} onChange={(e) => setLive(e.target.value)} inputMode="numeric" disabled={busy || !!posted} />
          <Suggest label="" options={[["1 hour", "60"], ["6 hours", "360"], ["1 day", "1440"]].map(([l, v]) => ({ label: l, value: v }))} onPick={setLive} disabled={busy || !!posted} />
          <p className="text-xs text-muted-foreground">
            At least {limits.liveMinutes}. Both windows together at most {limits.windowMinutes} ({minutesLabel(limits.windowMinutes)}).
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="What is being bought, from whom, and why. Say who the payee is: the validators read these words against each countersigner's interests."
          disabled={busy || !!posted}
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>One line of plain keyboard characters. No double quotes and no angle brackets.</span>
          <span className={cn(description.trim().length < limits.description[0] || description.trim().length > limits.description[1] ? "text-gold" : "")}>
            {description.trim().length} / {limits.description[1]} (at least {limits.description[0]})
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-medium">What happens when you sign</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>The amount is set aside in the desk so no other open spend can count on the same money. Nothing is paid yet.</li>
          <li>
            For {Number.isFinite(noticeMin) && noticeMin > 0 ? minutesLabel(noticeMin) : "the notice window"} nobody may
            countersign. Other members whose disclosure predates the spend may each add one sentence saying who the payee is. You
            may not: your place to say it is the description above.
          </li>
          <li>
            Then, for {Number.isFinite(liveMin) && liveMin > 0 ? minutesLabel(liveMin) : "the rest of the window"}, any member
            but you may countersign once. The second clear countersignature pays the payee in its own transaction.
          </li>
          <li>You cannot cancel or change a posted spend. If it does not find two clear countersignatures in time, it expires and the money stays in the desk.</li>
        </ul>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-gold">
          {error}
        </p>
      ) : null}
      {!posted ? (
        <Button type="button" variant="cool" size="lg" disabled={busy || !me} onClick={submit}>
          <Send /> Post the spend
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">One transaction, usually under a minute. No model is asked to post a spend.</p>
      <TxBlock tx={tx} label={`Posting a spend on ${desk.id}`} />
      {posted ? (
        <div className="rounded-xl border border-keeps/40 bg-keeps/10 p-4 text-sm">
          <p className="font-medium">
            Posted as S{posted.n} of {posted.desk || desk.id}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Its notice window runs until {when(posted.noticeUntil) || "the time shown on its page"}, and countersignatures close{" "}
            {when(posted.windowUntil) || "when its window ends"}. Next: open its page and, if your description did not say so,
            add a sentence saying who the payee is. Then two other members must countersign; you cannot.
          </p>
          <Button asChild variant="cool" size="sm" className="mt-3">
            <Link href={spendPath(posted.desk || desk.id, posted.n)}>
              Open S{posted.n} <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
