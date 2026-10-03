"use client";

// One desk: its money, its members with what each filed and when, and its spends with their
// windows and countersignatures so far. Also the three things anyone may do to a desk without
// being a member: fund it, reclaim their own share of what is free, and open another one.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp, FlaskConical, PiggyBank, Plus, Undo2, Users } from "lucide-react";

import { Address } from "@/components/address";
import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { ApprovalDots, PhaseBadge } from "@/components/reading";
import { TxBlock } from "@/components/tx-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useChainSeconds } from "@/components/use-clock";
import { DeskSelect, useDeskId } from "@/components/use-desk";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { succeeded, useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import {
  LIMITS,
  NO_REGISTER,
  calls,
  isMock,
  openedDesk,
  phaseOf,
  readCredit,
  readDesk,
  readDesks,
  readDesksFrom,
  readMember,
  readMembers,
  readSpends,
  spendPath,
  textProblem,
  type Desk,
  type DeskRow,
  type MemberRow,
  type SpendList,
  type SpendRow,
} from "@/lib/chain";
import { gen, minutesLabel, short, span, toAtto, when } from "@/lib/format";
import { isAddress, setCurrentDesk } from "@/lib/register";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";
/** Disclosures opened without a click; the rest open on demand, one view call each. */
const AUTO_OPEN = isMock ? 24 : 4;

export default function DeskPage() {
  const deskId = useDeskId();
  const me = useMe();
  const desks = useRead(() => readDesks(), []);
  const desk = useRead(() => readDesk(deskId), [deskId]);
  const exists = !!desk.data;
  const members = useRead(() => readMembers(deskId), [deskId], { enabled: exists });
  const spends = useRead(() => readSpends(deskId), [deskId], { enabled: exists });

  // The register lists its 24 most recent desks; the ones before them are read a page at a time.
  const [earlier, setEarlier] = React.useState<{ rows: DeskRow[]; first: number; loading: boolean; error: string }>({
    rows: [],
    first: Number.MAX_SAFE_INTEGER,
    loading: false,
    error: "",
  });
  const showEarlier = async (listedFrom: number) => {
    const from = Math.max(1, Math.min(listedFrom, earlier.first) - 24);
    const upTo = Math.min(listedFrom, earlier.first);
    setEarlier((e) => ({ ...e, loading: true, error: "" }));
    try {
      const page = (await readDesksFrom(from)).data;
      const rows = page.rows.filter((d) => Number(d.id.slice(1)) < upTo);
      setEarlier((e) => ({ rows: [...rows, ...e.rows], first: from, loading: false, error: "" }));
    } catch (e) {
      setEarlier((x) => ({ ...x, loading: false, error: e instanceof Error ? e.message : "could not reach the network" }));
    }
  };

  const refresh = React.useCallback(() => {
    void desks.refresh();
    void desk.refresh();
    void members.refresh();
    void spends.refresh();
  }, [desks, desk, members, spends]);

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Desk</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            One contract holds many desks. Each has its own money, its own members and its own spends. Reading needs no wallet.
          </p>
        </div>
        {desks.data && desks.data.rows.length ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {desks.data.count} {desks.data.count === 1 ? "desk" : "desks"} on this register
            </span>
            <DeskSelect desks={[...earlier.rows, ...desks.data.rows]} value={deskId} />
            {Math.min(desks.data.first, earlier.first) > 1 ? (
              <Button type="button" variant="ghost" size="sm" disabled={earlier.loading} onClick={() => void showEarlier(desks.data!.first)}>
                {earlier.loading ? "Reading" : `List earlier desks (the list starts at D${Math.min(desks.data.first, earlier.first)})`}
              </Button>
            ) : null}
            {earlier.error ? <span className="text-xs text-gold">{earlier.error}</span> : null}
          </div>
        ) : null}
      </div>

      {desk.error === NO_REGISTER ? null : (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <FlaskConical className="size-4 shrink-0 text-primary" /> New here, and alone?
            </p>
            <p className="mt-1 text-muted-foreground">
              A disclosure you file today is newer than every spend already on a desk, so countersigning one of them can only be
              refused as filed too late. That is the rule working. The practice desk opens a fresh desk and plays the other
              members, so you can be read by the validators and see the fund pay without anybody else present.
            </p>
          </div>
          <Button asChild variant="cool" size="sm" className="shrink-0">
            <Link href="/practice">
              Open the practice desk <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <ReadBlock
        state={desk}
        skeleton={<BlockSkeleton lines={4} />}
        empty={
          <div className={cn(card, "space-y-2")}>
            <p className="font-medium">This register has no desk {deskId} yet.</p>
            <p className="text-sm text-muted-foreground">
              {desks.data?.count
                ? "Pick another desk from the list above, or open a new one below."
                : "Nobody has opened a desk on it. Whoever opens the first one names it and funds it with one transaction, under a minute. The form is just below."}
            </p>
          </div>
        }
      >
        {(d) => (
          <>
            <DeskSummary desk={d} />
            <YourPosition desk={d} me={me.address} members={members.data ?? []} onChanged={refresh} />
            <section className={card} aria-labelledby="spends-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="spends-title" className="text-lg font-semibold">
                  Spends
                </h2>
                <Button asChild variant="outline" size="sm">
                  <Link href="/spend/new">
                    <Plus /> Post a spend
                  </Link>
                </Button>
              </div>
              <div className="mt-4">
                <ReadBlock
                  state={spends}
                  skeleton={<BlockSkeleton lines={3} className="border-0 bg-transparent p-0" />}
                  emptyWhen={(l) => l.rows.length === 0}
                  empty={
                    <p className="text-sm text-muted-foreground">
                      No spend has been posted on this desk yet. Any member may post one once the desk has{" "}
                      {LIMITS.membersToPost} members and some free money; it takes one transaction, under a minute.
                    </p>
                  }
                >
                  {(list) => <SpendRows list={list} />}
                </ReadBlock>
              </div>
            </section>
            <section className={card} aria-labelledby="members-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="members-title" className="flex items-center gap-2 text-lg font-semibold">
                  <Users className="size-4 text-primary" /> Members and what each filed
                </h2>
                <Button asChild variant="outline" size="sm">
                  <Link href="/enrol">File or amend your disclosure</Link>
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                The sequence number is the fund&apos;s own counter. A disclosure is read only against spends posted at a higher
                number than it carries.
              </p>
              <div className="mt-4">
                <ReadBlock
                  state={members}
                  skeleton={<BlockSkeleton lines={3} className="border-0 bg-transparent p-0" />}
                  emptyWhen={(rows) => rows.length === 0}
                  empty={
                    <p className="text-sm text-muted-foreground">
                      Nobody has enrolled on this desk yet. {d.openEnrolment ? "Enrolment is open to anyone." : "Only the addresses on its roster may enrol."}{" "}
                      Filing a disclosure takes one transaction, under a minute.
                    </p>
                  }
                >
                  {(rows) => (
                    <ul className="space-y-3">
                      {rows.map((m, i) => (
                        <MemberCard key={m.who} desk={d.id} row={m} mine={m.who === me.address} startOpen={i < AUTO_OPEN || m.who === me.address} />
                      ))}
                    </ul>
                  )}
                </ReadBlock>
              </div>
            </section>
          </>
        )}
      </ReadBlock>

      {desk.error && desk.data ? <ReadError onRetry={desk.retry} detail={desk.error} compact /> : null}
      {/* With no register there is nothing to open a desk on; the notice above says where to get one. */}
      {desk.error === NO_REGISTER ? null : <OpenDesk onOpened={refresh} startOpen={!desk.loading && !desk.error && !exists} />}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border bg-background/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function DeskSummary({ desk }: { desk: Desk }) {
  return (
    <section className={card} aria-labelledby="desk-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">Desk {desk.id}</p>
          <h2 id="desk-title" className="text-2xl font-semibold break-words">
            {desk.label}
          </h2>
          <p className="text-xs text-muted-foreground">
            Opened {when(desk.openedAt) || "at an unreadable time"} by <Address value={desk.opener} className="text-xs" /> · sequence
            number {desk.openedSeq} · the counter now stands at {desk.seqNow}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            desk.openEnrolment ? "border-gold/40 bg-gold/10 text-gold" : "border-keeps/40 bg-keeps/10 text-keeps",
          )}
        >
          {desk.openEnrolment ? "Open enrolment" : `Fixed roster of ${desk.roster.length}`}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {desk.openEnrolment
          ? "Anyone may enrol on this desk, with nobody's permission. That also means the desk is not safe for money that matters: enrolment is free, and three addresses one person controls could post a spend and carry it."
          : "Only the addresses named when this desk was opened may enrol. The roster can never be changed, not even by the opener."}{" "}
        Every spend here gives its members at least {minutesLabel(desk.minNoticeMinutes)} of notice before anyone may countersign;
        that floor was fixed when the desk was opened.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="In the pot" value={gen(desk.potAtto)} note="Everything the desk holds now." />
        <Figure label="Committed" value={gen(desk.committedAtto)} note={`Set aside for ${desk.openSpends} open ${desk.openSpends === 1 ? "spend" : "spends"}.`} />
        <Figure
          label="Free"
          value={gen(desk.freeAtto)}
          note={
            BigInt(desk.claimsDueAtto) > 0n
              ? `What a new spend may ask, and what funders may reclaim. ${gen(desk.claimsDueAtto)} more is owed to funders who left, from spends that expired.`
              : "What a new spend may ask, and what funders may reclaim."
          }
        />
        <Figure label="Paid out" value={gen(desk.drawnAtto)} note={`${desk.paid} paid, ${desk.expired} expired, ${desk.readings} readings stored.`} />
      </div>
    </section>
  );
}

function SpendRows({ list }: { list: SpendList }) {
  const now = useChainSeconds(list);
  const rows = list.rows.slice().reverse();
  return (
    <ul className="divide-y divide-border">
      {rows.map((s) => (
        <SpendLine key={s.n} s={s} now={now} />
      ))}
      {list.first > 1 ? (
        <li className="pt-3 text-xs text-muted-foreground">
          Showing the {list.rows.length} most recent of {list.count}. Older spends are read by their number, for example{" "}
          <Link href={spendPath(list.desk, 1)} className="text-primary underline-offset-4 hover:underline">
            S1
          </Link>
          .
        </li>
      ) : null}
    </ul>
  );
}

function SpendLine({ s, now }: { s: SpendRow; now: number }) {
  const phase = phaseOf(s, now);
  const timing =
    phase === "notice"
      ? `countersignatures open in ${span(s.noticeUntil - now)}`
      : phase === "approvals"
        ? `${span(s.windowUntil - now)} left to countersign`
        : phase === "overdue"
          ? "its window has passed; anyone may expire it"
          : "";
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <Link href={spendPath(s.desk, s.n)} className="group flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{s.label}</span>
            <span className="font-medium">{gen(s.amountAtto)}</span>
            <PhaseBadge phase={phase} />
          </div>
          <p className="text-xs text-muted-foreground">
            to <span className="font-mono">{short(s.payee)}</span>
            {timing ? ` · ${timing}` : ""} · {s.idents} {s.idents === 1 ? "identification" : "identifications"} · {s.attempts}{" "}
            {s.attempts === 1 ? "reading" : "readings"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ApprovalDots approvals={s.approvals} />
          <span className="inline-flex items-center gap-1 text-xs text-primary group-hover:underline">
            View <ArrowRight className="size-3.5" />
          </span>
        </div>
      </Link>
    </li>
  );
}

function MemberCard({ desk, row, mine, startOpen }: { desk: string; row: MemberRow; mine: boolean; startOpen: boolean }) {
  const [open, setOpen] = React.useState(startOpen);
  const full = useRead(() => readMember(desk, row.who), [desk, row.who, row.version], { enabled: open });
  return (
    <li className={cn("rounded-xl border bg-background/40 p-4", mine && "ring-1 ring-primary/50")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{row.number}</span>
          <Address value={row.who} className="text-xs" />
          {mine ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">you</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-2 py-0.5">sequence {row.filedSeq}</span>
          <span className="rounded-full border px-2 py-0.5">version {row.version}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? <ChevronUp /> : <ChevronDown />} {open ? "Hide" : "Show disclosure"}
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-3">
          <ReadBlock
            state={full}
            skeleton={<BlockSkeleton lines={2} className="border-0 bg-transparent p-0" />}
            empty={<p className="text-xs text-muted-foreground">The register holds no disclosure for this address on this desk.</p>}
          >
            {(m) => (
              <div className="space-y-3 text-sm">
                <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{m.statement}</blockquote>
                <ul className="space-y-1.5">
                  {m.entries.map((e, i) => (
                    <li key={i} className="rounded-lg border bg-card px-3 py-2 text-xs">
                      <span className="font-medium text-foreground">{e.name}</span>
                      <span className="text-muted-foreground">: {e.relationPhrase}.</span>
                      {e.detail ? <span className="text-foreground/80"> {e.detail}</span> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  {m.declared.length ? (
                    <>
                      Declared as their own:{" "}
                      {m.declared.map((a) => (
                        <Address key={a} value={a} className="mr-2 text-xs" />
                      ))}
                    </>
                  ) : (
                    "Declared no addresses of their own beyond the one they enrolled from."
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Filed {when(m.filedAt) || "at an unreadable time"}
                  {m.version > 1 ? `, amended ${m.version - 1} ${m.version === 2 ? "time" : "times"}; earlier versions stay in the contract's history` : ""}.
                </p>
              </div>
            )}
          </ReadBlock>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {row.entryCount} {row.entryCount === 1 ? "entry" : "entries"}, {row.declaredCount} declared{" "}
          {row.declaredCount === 1 ? "address" : "addresses"}.
        </p>
      )}
    </li>
  );
}

/** What the visitor's own address is to this desk, and the two money calls anyone may make. */
function YourPosition({ desk, me, members, onChanged }: { desk: Desk; me: string; members: MemberRow[]; onChanged: () => void }) {
  const credit = useRead(() => readCredit(desk.id, me), [desk.id, me], { enabled: !!me });
  const [amount, setAmount] = React.useState("5");
  const [amountError, setAmountError] = React.useState("");
  const tx = useTx(() => {
    onChanged();
    void credit.refresh();
  });
  const mine = members.find((m) => m.who === me);
  const c = credit.data;
  const busy = tx.sending || (!!tx.hash && !tx.final);

  const fund = () => {
    setAmountError("");
    let value: bigint;
    try {
      value = toAtto(amount);
    } catch (e) {
      setAmountError(e instanceof Error ? e.message : "Enter an amount.");
      return;
    }
    if (value <= 0n) {
      setAmountError("Send an amount greater than zero.");
      return;
    }
    void tx.start(calls.fund(desk.id, value));
  };

  return (
    <section className={card} aria-labelledby="you-title">
      <h2 id="you-title" className="flex items-center gap-2 text-lg font-semibold">
        <PiggyBank className="size-4 text-primary" /> You and this desk
      </h2>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 text-sm">
          {!me ? (
            <p className="text-muted-foreground">Connect a wallet to see whether you are a member or a funder of this desk.</p>
          ) : mine ? (
            <p>
              You are member <strong>{mine.number}</strong>, filed at sequence number {mine.filedSeq}. You may post spends,
              identify payees and countersign spends posted after that number. You have {mine.openPosted} of the{" "}
              {LIMITS.openSpendsPerPoster} spends one member may have open at once.
            </p>
          ) : !desk.openEnrolment && !desk.roster.includes(me) ? (
            <p className="text-muted-foreground">
              Your address is not on this desk&apos;s roster, so you cannot enrol here. You can still fund it, or open a desk of
              your own below.
            </p>
          ) : (
            <p>
              You are not a member yet.{" "}
              <Link href="/enrol" className="text-primary underline-offset-4 hover:underline">
                File your disclosure
              </Link>{" "}
              to enrol; one transaction, under a minute. It will count for spends posted after it, never for the ones already
              here. To see a spend through alone, use the{" "}
              <Link href="/practice" className="text-primary underline-offset-4 hover:underline">
                practice desk
              </Link>
              .
            </p>
          )}
          {me && c ? (
            <p className="text-muted-foreground">
              {BigInt(c.credit) > 0n
                ? `You hold ${gen(c.credit, "")} units of funder credit. Reclaiming now would pay you ${gen(c.wouldPayAtto)}: your share of the ${gen(c.freeAtto)} that is not committed to an open spend${BigInt(c.dueAtto) > 0n ? `, and ${gen(c.dueAtto)} owed to you from spends that expired` : ""}. What your units stand for in each open spend then becomes a claim on that spend alone.`
                : BigInt(c.dueAtto) > 0n
                  ? `You hold no units of funder credit, and ${gen(c.dueAtto)} is owed to you from spends that expired. Reclaiming pays it.`
                  : "You hold no funder credit on this desk."}
            </p>
          ) : null}
          {me && c && c.claims.length ? (
            <p className="text-muted-foreground">
              Your claims from an earlier reclaim: {c.claims.map((x) => `${gen(x.amountAtto)} on ${x.spend} (${x.state})`).join(", ")}. A
              claim on a spend that is paid is void, because you bear your part of it; one on a spend that expires is owed back to
              you.
            </p>
          ) : null}
          {credit.error ? <ReadError onRetry={credit.retry} detail={credit.error} compact /> : null}
        </div>
        <WalletGate action="fund this desk or reclaim your share">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="fund-amount" className="text-xs">
                  Add money to the pot (GEN)
                </Label>
                <Input id="fund-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-32" disabled={busy} />
              </div>
              <Button type="button" variant="cool" disabled={busy || !me} onClick={fund}>
                Fund the desk
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !c || !c.reclaimableNow}
                onClick={() => void tx.start(calls.reclaim(desk.id))}
                title={c && !c.reclaimableNow ? "Nothing to reclaim right now" : undefined}
              >
                <Undo2 /> Reclaim my share
              </Button>
            </div>
            {amountError ? <p className="text-xs text-gold">{amountError}</p> : null}
            <p className="text-xs text-muted-foreground">
              Funding credits your own address and decides nothing about where the money goes. Reclaiming pays you back pro rata
              from whatever is not committed to an open spend. Each is one transaction, under a minute; the money lands a few
              seconds after it is final.
            </p>
            <TxBlock tx={tx} label={tx.call?.fn === "reclaim" ? "Reclaiming your share" : "Funding the desk"} />
          </div>
        </WalletGate>
      </div>
    </section>
  );
}

/** Open a desk of your own: a name, an optional roster, and the first funding. */
function OpenDesk({ onOpened, startOpen }: { onOpened: () => void; startOpen: boolean }) {
  const me = useMe();
  const [shown, setShown] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [roster, setRoster] = React.useState("");
  const [amount, setAmount] = React.useState("5");
  const [notice, setNotice] = React.useState(String(LIMITS.noticeMinutes[0]));
  const [error, setError] = React.useState("");
  const tx = useTx((s) => {
    const opened = succeeded(s) ? openedDesk(s) : null;
    if (opened) setCurrentDesk(opened.desk);
    onOpened();
  });
  const visible = shown || startOpen;
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const opened = tx.final && succeeded(tx.final) ? openedDesk(tx.final) : null;

  const submit = () => {
    setError("");
    const name = label.trim();
    const p = textProblem(name, LIMITS.label[0], LIMITS.label[1], "The desk's name");
    if (p) return setError(p);
    const list = roster.split(/[\s,]+/).map((a) => a.trim()).filter(Boolean);
    const bad = list.find((a) => !isAddress(a));
    if (bad) return setError(`Each roster entry is 0x followed by 40 hexadecimal characters. This one is not: ${bad.slice(0, 46)}`);
    const unique = Array.from(new Set(list.map((a) => a.toLowerCase())));
    if (unique.length && (unique.length < LIMITS.roster[0] || unique.length > LIMITS.roster[1]))
      return setError(`A roster names ${LIMITS.roster[0]} to ${LIMITS.roster[1]} addresses, because a spend needs its poster and two other members. Leave it empty for open enrolment.`);
    let value: bigint;
    try {
      value = toAtto(amount || "0");
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Enter an amount.");
    }
    if (value > me.balanceAtto) return setError(`Your balance is ${gen(me.balanceAtto)}, less than the ${gen(value)} you want to open the desk with.`);
    const floor = Number(notice.trim());
    if (!Number.isInteger(floor) || floor < LIMITS.noticeMinutes[0] || floor > LIMITS.noticeMinutes[1])
      return setError(`The minimum notice is a whole number of minutes, ${LIMITS.noticeMinutes[0]} to ${LIMITS.noticeMinutes[1]}.`);
    void tx.start(calls.openDesk(name, unique, value, floor));
  };

  return (
    <section className={card} aria-labelledby="open-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="open-title" className="text-lg font-semibold">
          Open a desk of your own
        </h2>
        {!startOpen ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setShown((s) => !s)} aria-expanded={visible}>
            {visible ? <ChevronUp /> : <ChevronDown />} {visible ? "Hide the form" : "Show the form"}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Anyone may. You name the desk, fix its roster once and for all (or leave it empty for open enrolment), and the value you
        send is its first funding, credited to you and reclaimable by you alone. Opening a desk gives you no other power over it.
      </p>
      {visible ? (
        <WalletGate action="open a desk" className="mt-4">
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1">
                <Label htmlFor="desk-label">
                  Name ({LIMITS.label[0]} to {LIMITS.label[1]} characters)
                </Label>
                <Input id="desk-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Larch Court Tenants' Association" disabled={busy} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="desk-amount">First funding (GEN)</Label>
                <Input id="desk-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={busy} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="desk-roster">Roster (optional)</Label>
              <Textarea
                id="desk-roster"
                value={roster}
                onChange={(e) => setRoster(e.target.value)}
                rows={3}
                className="font-mono text-xs"
                placeholder="Leave empty for open enrolment, or list 3 to 24 addresses, one per line."
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                An empty roster lets anyone enrol, which suits a demonstration and nothing more. A desk for money that matters
                names its members here; the list can never be changed afterwards.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="desk-notice">Minimum notice (minutes)</Label>
              <Input id="desk-notice" value={notice} onChange={(e) => setNotice(e.target.value)} inputMode="numeric" className="w-32" disabled={busy} />
              <p className="text-xs text-muted-foreground">
                The least time every spend on this desk must wait before anyone may countersign it, {LIMITS.noticeMinutes[0]} to{" "}
                {LIMITS.noticeMinutes[1]} minutes. It is the time members have to see a spend and say who its payee is. Fixed here
                for good: {LIMITS.noticeMinutes[0]} suits a demonstration, a desk holding real money wants hours.
              </p>
            </div>
            {error ? <p className="text-sm text-gold">{error}</p> : null}
            <Button type="button" variant="cool" disabled={busy || !me.address} onClick={submit}>
              <Plus /> Open the desk
            </Button>
            <p className="text-xs text-muted-foreground">One transaction, under a minute. A refusal returns what you sent in the same transaction.</p>
            <TxBlock tx={tx} label="Opening the desk" />
            {opened ? (
              <div className="rounded-xl border border-keeps/40 bg-keeps/10 p-4 text-sm">
                <p className="font-medium">
                  Desk {opened.desk} is open: {opened.label}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  This browser now shows it. Next: file your own disclosure on it, and have two more members do the same before
                  the first spend can be posted.
                </p>
                <Button asChild variant="cool" size="sm" className="mt-3">
                  <Link href="/enrol">
                    Enrol on {opened.desk} <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </WalletGate>
      ) : null}
    </section>
  );
}
