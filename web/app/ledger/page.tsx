"use client";

// The public record of a desk: every spend, every reading on it (counted or recused, with the two
// characters the validators stored and the contract's sentence), and the ring of calls that were
// refused before any reading. No wallet is needed for any of it.

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Address } from "@/components/address";
import { BlockSkeleton, ReadBlock, ReadError, readEach } from "@/components/read-state";
import { ApprovalDots, PhaseBadge, VerdictBadge } from "@/components/reading";
import { Button } from "@/components/ui/button";
import { useChainSeconds } from "@/components/use-clock";
import { DeskSelect, useDeskId } from "@/components/use-desk";
import { useRead } from "@/components/use-read";
import {
  OPEN_RING,
  phaseOf,
  readDesk,
  readDesks,
  readReadings,
  readRefusals,
  readSpends,
  spendPath,
  type ReadResult,
  type Reading,
  type Refusal,
  type SpendList,
  type SpendRow,
} from "@/lib/chain";
import { gen, short, when } from "@/lib/format";
import { sentence } from "@/lib/words";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";
/** Readings are one view call per spend; the newest this many are read at once, the rest on request. */
const STEP = 8;

type Ledger = { list: SpendList; readings: Record<number, Reading[] | null> };

async function readLedger(desk: string, count: number): Promise<ReadResult<Ledger>> {
  const list = await readSpends(desk);
  const newest = list.data.rows.slice().reverse();
  const wanted = newest.filter((s) => s.attempts > 0).slice(0, count);
  const got = await readEach(wanted, (s) => readReadings(desk, s.n), 3);
  const readings: Ledger["readings"] = {};
  wanted.forEach((s, i) => {
    const r = got[i];
    readings[s.n] = r.status === "fulfilled" ? r.value.data : null;
  });
  return { data: { list: list.data, readings }, source: list.source };
}

export default function LedgerPage() {
  const deskId = useDeskId();
  const [count, setCount] = React.useState(STEP);
  const [onlyRecusals, setOnlyRecusals] = React.useState(false);
  const desks = useRead(() => readDesks(), []);
  const desk = useRead(() => readDesk(deskId), [deskId]);
  const exists = !!desk.data;
  const ledger = useRead(() => readLedger(deskId, count), [deskId, count], { enabled: exists });
  const refusals = useRead(() => readRefusals(deskId), [deskId], { enabled: exists });
  const outsiders = useRead(() => readRefusals(OPEN_RING), [], { enabled: exists });
  const now = useChainSeconds(ledger.data?.list);
  const d = desk.data;

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Ledger</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every spend of a desk and every reading on it. A recusal is published exactly like a clear countersignature: with the
            two characters the validators agreed on and the sentence the contract wrote. No wallet is needed to read any of this.
          </p>
        </div>
        {desks.data && desks.data.rows.length ? <DeskSelect desks={desks.data.rows} value={deskId} /> : null}
      </div>

      <ReadBlock
        state={desk}
        skeleton={<BlockSkeleton lines={3} />}
        empty={
          <div className={cn(card, "space-y-3 text-sm")}>
            <p className="font-medium">This register has no desk {deskId} yet, so there is nothing on its ledger.</p>
            <Button asChild variant="cool" size="sm">
              <Link href="/desk">
                Open a desk <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      >
        {(dk) => (
          <section className={card}>
            <p className="text-xs font-semibold tracking-widest text-primary uppercase">Desk {dk.id}</p>
            <h2 className="text-xl font-semibold break-words">{dk.label}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Spends", dk.spends],
                ["Paid", dk.paid],
                ["Expired", dk.expired],
                ["Open", dk.openSpends],
                ["Readings", dk.readings],
                ["Paid out", gen(dk.drawnAtto)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border bg-background/40 p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </ReadBlock>

      {d ? (
        <section className={card} aria-labelledby="spends-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="spends-title" className="text-lg font-semibold">
              Spends and their readings
            </h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={onlyRecusals} onChange={(e) => setOnlyRecusals(e.target.checked)} />
              Show recusals only
            </label>
          </div>
          <div className="mt-4">
            <ReadBlock
              state={ledger}
              skeleton={<BlockSkeleton lines={5} className="border-0 bg-transparent p-0" />}
              emptyWhen={(l) => l.list.rows.length === 0}
              empty={<p className="text-sm text-muted-foreground">No spend has been posted on this desk yet, so the ledger is empty.</p>}
            >
              {(l) => {
                const rows = l.list.rows.slice().reverse();
                const unread = rows.filter((s) => s.attempts > 0 && !(s.n in l.readings)).length;
                const shown = onlyRecusals
                  ? rows.filter((s) => (l.readings[s.n] ?? []).some((r) => r.verdict !== "clear") || (s.attempts > 0 && !(s.n in l.readings)))
                  : rows;
                return (
                  <div className="space-y-4">
                    {shown.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recusal has been stored on the spends read so far.</p>
                    ) : (
                      <ul className="space-y-4">
                        {shown.map((s) => (
                          <SpendEntry key={s.n} s={s} now={now || l.list.chainNow} readings={l.readings[s.n]} onlyRecusals={onlyRecusals} onRetry={ledger.retry} />
                        ))}
                      </ul>
                    )}
                    {unread > 0 ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setCount((c) => c + STEP)}>
                        Read the readings of {Math.min(unread, STEP)} older {Math.min(unread, STEP) === 1 ? "spend" : "spends"}
                      </Button>
                    ) : null}
                    {l.list.first > 1 ? (
                      <p className="text-xs text-muted-foreground">
                        The contract lists a desk&apos;s {l.list.rows.length} most recent spends of {l.list.count}. An older one is read by its
                        number from its own page.
                      </p>
                    ) : null}
                  </div>
                );
              }}
            </ReadBlock>
          </div>
        </section>
      ) : null}

      {d ? (
        <section className={card} aria-labelledby="refusals-title">
          <h2 id="refusals-title" className="text-lg font-semibold">
            Refused before any reading
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Calls the contract turned away on procedure: a poster trying to countersign their own spend, a call during the notice
            window, a second attempt. Nothing was read and no attempt was spent. This desk has turned away {d.refusals}{" "}
            {d.refusals === 1 ? "call" : "calls"} from its own members so far and keeps the most recent twelve. Only a member
            can write to this ring, so nobody outside the desk can push a member&apos;s refusal out of sight.
          </p>
          <div className="mt-4">
            <ReadBlock
              state={refusals}
              skeleton={<BlockSkeleton lines={2} className="border-0 bg-transparent p-0" />}
              emptyWhen={(r) => r.length === 0}
              empty={<p className="text-sm text-muted-foreground">No call has been refused on procedure on this desk.</p>}
            >
              {(rows) => (
                <ul className="space-y-2">
                  {rows
                    .slice()
                    .reverse()
                    .map((r) => (
                      <RefusalRow key={r.seq} r={r} />
                    ))}
                </ul>
              )}
            </ReadBlock>
          </div>
        </section>
      ) : null}

      {d ? (
        <section className={card} aria-labelledby="outsiders-title">
          <h2 id="outsiders-title" className="text-lg font-semibold">
            Refused, from addresses with no disclosure on the desk they named
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One ring for the whole register, whichever desk the caller named: somebody who is not a member trying to countersign,
            a desk that does not exist, a desk name that is too short. The most recent twelve are kept.
          </p>
          <div className="mt-4">
            <ReadBlock
              state={outsiders}
              skeleton={<BlockSkeleton lines={2} className="border-0 bg-transparent p-0" />}
              emptyWhen={(r) => r.length === 0}
              empty={<p className="text-sm text-muted-foreground">No call from outside a desk has been refused on this register.</p>}
            >
              {(rows) => (
                <ul className="space-y-2">
                  {rows
                    .slice()
                    .reverse()
                    .map((r) => (
                      <RefusalRow key={r.seq} r={r} />
                    ))}
                </ul>
              )}
            </ReadBlock>
          </div>
        </section>
      ) : null}
      {/* The desk list failing alone is worth a line; when the desk read failed too, its notice above already says so. */}
      {desks.error && !desks.data && d ? <ReadError onRetry={desks.retry} detail={desks.error} compact /> : null}
    </div>
  );
}

function SpendEntry({ s, now, readings, onlyRecusals, onRetry }: { s: SpendRow; now: number; readings: Reading[] | null | undefined; onlyRecusals: boolean; onRetry: () => void }) {
  const list = (readings ?? []).filter((r) => !onlyRecusals || r.verdict !== "clear");
  return (
    <li className="rounded-xl border bg-background/40 p-4">
      <Link href={spendPath(s.desk, s.n)} className="group flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold">{s.label}</span>
          <span className="font-medium">{gen(s.amountAtto)}</span>
          <span className="text-xs text-muted-foreground">
            to <span className="font-mono">{short(s.payee)}</span>
          </span>
          <PhaseBadge phase={phaseOf(s, now)} />
        </div>
        <div className="flex items-center gap-3">
          <ApprovalDots approvals={s.approvals} />
          <span className="inline-flex items-center gap-1 text-xs text-primary group-hover:underline">
            View <ArrowRight className="size-3.5" />
          </span>
        </div>
      </Link>
      <div className="mt-3 space-y-2">
        {s.attempts === 0 ? (
          <p className="text-xs text-muted-foreground">No countersignature has been attempted on it.</p>
        ) : readings === undefined ? (
          <p className="text-xs text-muted-foreground">
            {s.attempts} {s.attempts === 1 ? "reading" : "readings"} stored; not read yet (the button below reads older spends).
          </p>
        ) : readings === null ? (
          <ReadError onRetry={onRetry} compact />
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">Every reading on it was clear.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.member + r.attempt} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.number}</span>
                  <Address value={r.member} className="text-xs" />
                  <VerdictBadge verdict={r.verdict} />
                  <code className="rounded border px-1.5 py-0.5 font-mono text-xs" title="if carried out, if not carried out">
                    {r.value}
                  </code>
                </div>
                <p className="mt-1.5 text-xs text-foreground/85">{r.why}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {r.modelAsked ? "Read by the validators" : "Decided by the contract alone, no model asked"} · disclosure at sequence{" "}
                  {r.filedSeq}, spend at {r.postedSeq}
                  {r.at ? ` · ${when(r.at)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function RefusalRow({ r }: { r: Refusal }) {
  return (
    <li className="rounded-lg border bg-background/40 p-3 text-sm">
      <p className="text-foreground/90">{sentence(r.reason)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {r.desk ? <span>{r.desk}</span> : null}
        {r.spend ? <span>{r.spend}</span> : null}
        {r.by ? <Address value={r.by} className="text-xs" /> : null}
        <span>
          refusal {r.seq}
          {r.at ? ` · ${when(r.at)}` : ""}
        </span>
      </p>
    </li>
  );
}
