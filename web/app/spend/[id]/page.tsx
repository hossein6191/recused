"use client";

// One spend. The document the contract itself built (the bytes that are judged), who said who the
// payee is, every countersignature or recusal with its stored pair and the contract's sentence,
// and countdowns on chain time. During the notice window a member may identify the payee; after
// it, a member may countersign, and the page says what each outcome will be before they sign and
// what happened after.

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FileText, PenLine, RefreshCw, Signature, TimerOff, TriangleAlert } from "lucide-react";

import { Address } from "@/components/address";
import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { ApprovalDots, PhaseBadge, ReadingCard, TokenPair } from "@/components/reading";
import { TxBlock } from "@/components/tx-block";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Suggest } from "@/components/suggest";
import { useChainSeconds } from "@/components/use-clock";
import { useMe } from "@/components/use-me";
import { useRead, type ReadState } from "@/components/use-read";
import { useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import {
  LIMITS,
  approveOutcome,
  balanceOf,
  calls,
  invalidateReads,
  parseSpendId,
  phaseOf,
  readDocument,
  readIdents,
  readMember,
  readReadings,
  readSpend,
  spendPath,
  textProblem,
  txUrl,
  type ApproveOutcome,
  type Ident,
  type Member,
  type Phase,
  type Reading,
  type Spend,
  type SpendDocument,
} from "@/lib/chain";
import { gen, short, span, when } from "@/lib/format";
import { sha256Hex } from "@/lib/hash";
import { rememberReading } from "@/lib/register";
import { sentence } from "@/lib/words";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";
/** How often an open spend is re-read to notice other members' countersignatures (one view call). */
const WATCH_MS = 30_000;

export default function SpendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const parsed = parseSpendId(id);
  if (!parsed)
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Spend</h1>
        <div className={cn(card, "space-y-3 text-sm")}>
          <p className="font-medium">That is not a spend id.</p>
          <p className="text-muted-foreground">A spend is named by its desk and its number, like D1-S3. The desk page lists every spend.</p>
          <Button asChild variant="cool" size="sm">
            <Link href="/desk">
              Open the desk <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    );
  return <SpendView desk={parsed.desk} n={parsed.n} />;
}

function SpendView({ desk, n }: { desk: string; n: number }) {
  const me = useMe();
  const spend = useRead(() => readSpend(desk, n), [desk, n]);
  const s = spend.data;
  const doc = useRead(() => readDocument(desk, n), [desk, n], { enabled: !!s });
  const idents = useRead(() => readIdents(desk, n), [desk, n], { enabled: !!s && s.idents > 0 });
  const readings = useRead(() => readReadings(desk, n), [desk, n], { enabled: !!s && s.attempts > 0 });
  const member = useRead(() => readMember(desk, me.address), [desk, me.address], { enabled: !!s && !!me.address });

  const now = useChainSeconds(s);
  const phase: Phase | null = s && now ? phaseOf(s, now) : null;

  const refreshAll = React.useCallback(() => {
    invalidateReads();
    void spend.refresh();
    void doc.refresh();
    void idents.refresh();
    void readings.refresh();
    void member.refresh();
  }, [spend, doc, idents, readings, member]);
  const refreshRef = React.useRef(refreshAll);
  React.useEffect(() => {
    refreshRef.current = refreshAll;
  });

  // When a window closes on the chain's clock, read again: the document seals, the buttons change.
  const lastPhase = React.useRef<Phase | null>(null);
  React.useEffect(() => {
    if (!phase) return;
    if (lastPhase.current && lastPhase.current !== phase) refreshRef.current();
    lastPhase.current = phase;
  }, [phase]);

  // While the spend is open, look every half minute for what other members did.
  const open = s?.state === "open";
  const seen = s ? `${s.state}|${s.approvals}|${s.attempts}|${s.idents}` : "";
  const seenRef = React.useRef(seen);
  React.useEffect(() => {
    seenRef.current = seen;
  });
  React.useEffect(() => {
    if (!open) return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      try {
        const d = (await readSpend(desk, n, { fresh: true })).data;
        if (d && `${d.state}|${d.approvals}|${d.attempts}|${d.idents}` !== seenRef.current) refreshRef.current();
      } catch {
        /* a dropped poll is not news; the next one may answer */
      }
    }, WATCH_MS);
    return () => clearInterval(t);
  }, [open, desk, n]);

  return (
    <div className="container-site space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/desk" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <ArrowLeft className="size-3.5" /> Desk {desk}
        </Link>
        <Button type="button" variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw /> Read again
        </Button>
      </div>

      <ReadBlock
        state={spend}
        skeleton={<BlockSkeleton lines={6} />}
        empty={
          <div className={cn(card, "space-y-3 text-sm")}>
            <p className="font-medium">
              Desk {desk} holds no spend S{n}.
            </p>
            <p className="text-muted-foreground">
              Spends are numbered in the order they were posted. If this one was posted a moment ago, the register may need a few
              seconds to show it; use Read again above.
            </p>
            <Button asChild variant="cool" size="sm">
              <Link href="/desk">
                See the desk&apos;s spends <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      >
        {(sp) => (
          <>
            <Summary spend={sp} phase={phase ?? phaseOf(sp, sp.chainNow || Math.floor(sp.readAtMs / 1000))} now={now} readings={readings.data ?? []} onChanged={refreshAll} />
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div className="space-y-6">
                <DocumentCard state={doc} spend={sp} />
                <Identifications
                  spend={sp}
                  phase={phase}
                  idents={idents.data ?? []}
                  identsError={idents.error}
                  retry={idents.retry}
                  member={member.data}
                  me={me.address}
                  onChanged={refreshAll}
                />
              </div>
              <div className="space-y-6">
                <Countersign
                  spend={sp}
                  phase={phase}
                  now={now}
                  me={me.address}
                  member={member.data}
                  memberLoading={member.loading}
                  readings={readings.data ?? []}
                  onChanged={refreshAll}
                />
                <ReadingsCard spend={sp} readings={readings.data ?? []} loading={readings.loading} error={readings.error} retry={readings.retry} me={me.address} />
              </div>
            </div>
          </>
        )}
      </ReadBlock>
    </div>
  );
}

// ---- the summary: what just happened, who acts next, how long it takes ------------------

function Summary({ spend, phase, now, readings, onChanged }: { spend: Spend; phase: Phase; now: number; readings: Reading[]; onChanged: () => void }) {
  const tx = useTx(() => onChanged());
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const total = Math.max(1, spend.windowUntil - spend.postedAt);
  const noticeShare = Math.min(100, Math.max(4, ((spend.noticeUntil - spend.postedAt) / total) * 100));
  const progress = now ? Math.min(100, Math.max(0, ((now - spend.postedAt) / total) * 100)) : 0;
  const recusals = readings.filter((r) => r.verdict && r.verdict !== "clear").length;

  let status: React.ReactNode;
  if (phase === "notice") {
    status = (
      <>
        <p className="font-medium">In its notice window for another {span(spend.noticeUntil - now)}.</p>
        <p className="text-muted-foreground">
          Nobody may countersign yet. Until {when(spend.noticeUntil)}, any member but the poster whose disclosure predates this
          spend may add one sentence saying who the payee is. Then countersignatures open for {span(spend.windowUntil - spend.noticeUntil)}. This page
          moves on by itself.
        </p>
      </>
    );
  } else if (phase === "approvals") {
    status = (
      <>
        <p className="font-medium">
          Open for countersignatures for another {span(spend.windowUntil - now)}, with {spend.approvals} of the 2 clear ones it needs.
        </p>
        <p className="text-muted-foreground">
          The document is sealed. Next: any member but the poster may countersign, once.{" "}
          {spend.approvals === 1 ? "The next clear countersignature pays the payee in its own transaction." : "Two clear ones pay the payee."}{" "}
          If two are not found by {when(spend.windowUntil)}, the spend expires and the money stays in the desk.
        </p>
      </>
    );
  } else if (phase === "overdue") {
    status = (
      <>
        <p className="font-medium">Its window closed {when(spend.windowUntil)} with {spend.approvals} of 2 clear countersignatures.</p>
        <p className="text-muted-foreground">
          It can no longer be countersigned. Next: anyone may expire it, which stops {gen(spend.amountAtto)} being committed. No
          money leaves the desk. One transaction, under a minute.
        </p>
      </>
    );
  } else if (phase === "paid") {
    status = (
      <>
        <p className="font-medium">
          Paid{spend.paidAt ? ` ${when(spend.paidAt)}` : ""}: {gen(spend.amountAtto)} left the fund for {short(spend.payee)}.
        </p>
        <p className="text-muted-foreground">
          The money moved in the transaction of the second clear countersignature, after the spend was marked paid. Nothing more
          can happen to this spend and nobody needs to act.
        </p>
      </>
    );
  } else {
    status = (
      <>
        <p className="font-medium">
          Expired{spend.expiredAt ? ` ${when(spend.expiredAt)}` : ""} with {spend.approvals} of 2 clear countersignatures.
        </p>
        <p className="text-muted-foreground">
          No money left the desk; the amount simply stopped being committed. The same payment may be posted again as a new spend.
          Nobody needs to act.
        </p>
      </>
    );
  }

  return (
    <section className={card} aria-labelledby="spend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">
            Spend {spend.label} of desk {spend.desk}
          </p>
          <h1 id="spend-title" className="text-3xl font-bold tracking-tight">
            {gen(spend.amountAtto)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ApprovalDots approvals={spend.approvals} />
          <PhaseBadge phase={phase} />
        </div>
      </div>
      <p className="mt-3 text-base text-foreground/90">{spend.description}</p>
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Payee</dt>
          <dd>
            <Address value={spend.payee} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Posted by</dt>
          <dd>
            <Address value={spend.poster} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">Posted</dt>
          <dd>
            {when(spend.postedAt) || "at an unreadable time"} · sequence number {spend.postedSeq}
            {spend.gateSeq !== spend.postedSeq ? ` · gate ${spend.gateSeq}` : ""}
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">So far</dt>
          <dd>
            {spend.attempts} {spend.attempts === 1 ? "reading" : "readings"}, {recusals} {recusals === 1 ? "recusal" : "recusals"}, {spend.idents}{" "}
            {spend.idents === 1 ? "identification" : "identifications"}
          </dd>
        </div>
      </dl>

      {spend.gateSeq !== spend.postedSeq ? (
        <p className="mt-3 text-xs text-muted-foreground">
          An earlier spend to this payee address was posted at sequence number {spend.gateSeq} and none has been paid since, so
          this one belongs to the same run and keeps that gate: a disclosure filed after {spend.gateSeq} is late for it, a
          reading that was not clear on the earlier spend still stands, and what members said about the payee was carried over.
          Posting the same payment again is the same question.
        </p>
      ) : null}

      <div className="mt-5 space-y-2" aria-hidden={spend.state !== "open"}>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 bg-primary/35" style={{ width: `${noticeShare}%` }} />
          <div className="absolute inset-y-0 bg-keeps/25" style={{ left: `${noticeShare}%`, right: 0 }} />
          {spend.state === "open" ? <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${progress}%` }} /> : null}
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Notice window until {when(spend.noticeUntil)}</span>
          <span>Countersignatures until {when(spend.windowUntil)}</span>
        </div>
      </div>

      <div className={cn("mt-5 space-y-1 rounded-xl border p-4 text-sm", phase === "paid" ? "border-keeps/40 bg-keeps/10" : phase === "overdue" ? "border-gold/40 bg-gold/10" : "bg-background/40")}>
        {status}
        {phase === "overdue" ? (
          <WalletGate action="expire this spend" className="mt-3">
            <Button type="button" variant="cool" size="sm" className="mt-3" disabled={busy} onClick={() => void tx.start(calls.expire(spend.desk, spend.n))}>
              <TimerOff /> Expire {spend.label}
            </Button>
          </WalletGate>
        ) : null}
      </div>
      <TxBlock tx={tx} label={`Expiring ${spend.label}`} className="mt-3" />
    </section>
  );
}

// ---- the judged document ------------------------------------------------------------------

function DocumentCard({ state, spend }: { state: ReadState<SpendDocument | null>; spend: Spend }) {
  const text = state.data?.text ?? "";
  const [hashed, setHashed] = React.useState<{ of: string; digest: string } | null>(null);
  React.useEffect(() => {
    if (!text) return;
    let alive = true;
    sha256Hex(text)
      .then((digest) => {
        if (alive) setHashed({ of: text, digest });
      })
      .catch(() => {
        /* no WebCrypto on this origin: the check line simply does not appear */
      });
    return () => {
      alive = false;
    };
  }, [text]);
  const mine = hashed && hashed.of === text ? hashed.digest : "";

  return (
    <section className={card} aria-labelledby="doc-title">
      <h2 id="doc-title" className="flex items-center gap-2 text-lg font-semibold">
        <FileText className="size-4 text-primary" /> The document the validators read
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Built by the contract from what it holds, by the same function the consensus round calls. Only the quoted parts were
        written by members; every other line is the contract&apos;s own.
      </p>
      <div className="mt-4">
        <ReadBlock state={state} skeleton={<BlockSkeleton lines={6} className="border-0 bg-transparent p-0" />} empty={<p className="text-sm text-muted-foreground">The register returned no document for this spend.</p>}>
          {(d) => (
            <div className="space-y-3">
              <pre className="doc-text rounded-xl border bg-background/70 p-4 text-foreground/90">{d.text}</pre>
              {d.textSecond && d.textSecond !== d.text ? (
                <details className="rounded-xl border bg-background/40 px-4 py-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-foreground/90">The same lines as the second asking prints them</summary>
                  <p className="mt-2">
                    Every reading asks twice. The second asking prints the identifications in another order, so a reader that leans
                    on position shows up in the stored value instead of agreeing with itself. Nothing else changes.
                  </p>
                  <pre className="doc-text mt-2 text-foreground/90">{d.textSecond}</pre>
                </details>
              ) : null}
              <div className="space-y-1 text-xs text-muted-foreground">
                {mine && d.digest ? (
                  <p className={cn("flex items-start gap-1.5", mine === d.digest ? "text-keeps" : "text-gold")}>
                    {mine === d.digest ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
                    <span>
                      {mine === d.digest
                        ? "This browser hashed the text above and got the digest the contract publishes for it."
                        : "This browser hashed the text above and did not get the contract's digest. Read again; if it persists, trust the explorer over this page."}
                    </span>
                  </p>
                ) : null}
                <p className="break-hash">
                  sha256 <span className="font-mono text-foreground/80">{d.digest || "not published"}</span>
                </p>
                <p>
                  {d.sealed
                    ? d.sealedDigest === d.digest
                      ? "Sealed: this is the digest the first countersignature stored, and every reading on this spend carries it."
                      : `Sealed at the first countersignature with digest ${short(d.sealedDigest, 10, 8)}.`
                    : spend.state === "open"
                      ? "Not sealed yet. It is sealed at the first countersignature; identifications close before that, so every reading sees the same text."
                      : "No countersignature reached a reading, so no digest was sealed."}
                </p>
              </div>
            </div>
          )}
        </ReadBlock>
      </div>
    </section>
  );
}

// ---- identifications ------------------------------------------------------------------------

function Identifications({
  spend,
  phase,
  idents,
  identsError,
  retry,
  member,
  me,
  onChanged,
}: {
  spend: Spend;
  phase: Phase | null;
  idents: Ident[];
  identsError: string;
  retry: () => void;
  member: Member | null;
  me: string;
  onChanged: () => void;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const tx = useTx(() => {
    setText("");
    onChanged();
  });
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const already = idents.some((i) => i.by === me);
  const full = spend.idents >= LIMITS.identsPerSpend;
  const [min, max] = LIMITS.identification;

  let box: React.ReactNode = null;
  if (phase === "notice") {
    if (!me) box = null;
    else if (!member) box = <p className="text-sm text-muted-foreground">Only members of this desk may say who a payee is.</p>;
    else if (spend.poster === me)
      box = (
        <p className="text-sm text-muted-foreground">
          You posted this spend, so the place to say who its payee is was the description. An identification is another
          member&apos;s word.
        </p>
      );
    else if (member.filedSeq > spend.gateSeq)
      box = (
        <p className="text-sm text-muted-foreground">
          Your disclosure carries sequence number {member.filedSeq}, above this spend&apos;s gate of {spend.gateSeq}. A disclosure
          newer than that is never read against this spend, and neither is its holder&apos;s word about the payee.
        </p>
      );
    else if (already) box = <p className="text-sm text-muted-foreground">You have identified the payee of this spend. One sentence per member.</p>;
    else if (spend.attempts > 0)
      box = <p className="text-sm text-muted-foreground">This spend has already been read, so its document is sealed and takes no more identifications.</p>;
    else
      box = (
        <div className="space-y-2">
          {full ? (
            <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
              The {LIMITS.identsPerSpend} places for an identification are taken. You may still send yours: it will not be printed,
              but the contract counts the attempt, and the document every countersigner is read against will say how many
              members were turned away. One try per member.
            </p>
          ) : null}
          <label htmlFor="ident" className="text-sm font-medium">
            Say who the payee is, in one sentence
          </label>
          <Textarea id="ident" value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="The payee is Pelican Press, the print shop on Quay Street." disabled={busy} />
          <Suggest
            options={[
              "The payee is Pelican Press, the print shop on Quay Street.",
              "The payee is Castle Locksmiths on Mill Lane, a firm with no member of this desk in it.",
              "The payee is the residents' gardening club, which one of our members chairs.",
              "The payee is Harbour Hardware, the shop the tables were quoted by.",
            ].map((t) => ({ label: t.length > 46 ? t.slice(0, 44) + "..." : t, value: t }))}
            onPick={setText}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {min} to {max} characters, signed with your address and added to the document every countersigner is read against. It
              is your claim; the contract cannot check it.
            </p>
            <span className="text-[11px] text-muted-foreground">
              {text.trim().length} / {max}
            </span>
          </div>
          {error ? <p className="text-sm text-gold">{error}</p> : null}
          <WalletGate action="identify the payee">
            <Button
              type="button"
              variant="cool"
              size="sm"
              disabled={busy}
              onClick={() => {
                const p = textProblem(text.trim(), min, max, "The identification");
                setError(p);
                if (!p) void tx.start(calls.identify(spend.desk, spend.n, text));
              }}
            >
              <PenLine /> {full ? "Send it to be counted" : "Identify the payee"}
            </Button>
          </WalletGate>
          <p className="text-xs text-muted-foreground">One transaction, under a minute. It must land before the notice window closes.</p>
        </div>
      );
  }

  return (
    <section className={card} aria-labelledby="idents-title">
      <h2 id="idents-title" className="text-lg font-semibold">
        Who members say the payee is
      </h2>
      <div className="mt-3 space-y-3">
        {identsError && !idents.length ? <ReadError onRetry={retry} detail={identsError} compact /> : null}
        {spend.idents === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has said who the payee is{phase === "notice" ? " yet" : ""}. The document says so in a line of its own, so the
            omission is on the record.
          </p>
        ) : (
          <ul className="space-y-2">
            {idents.map((i) => (
              <li key={i.n} className="rounded-xl border bg-background/40 p-3 text-sm">
                <p className="text-foreground/90">{i.text}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>M{i.member}</span>
                  <Address value={i.by} className="text-xs" />
                  <span>
                    sequence {i.seq}
                    {i.at ? ` · ${when(i.at)}` : ""}
                    {i.from ? ` · carried over from ${i.from}` : ""}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
        {spend.shutOut > 0 ? (
          <p className="text-xs text-muted-foreground">
            {spend.shutOut} {spend.shutOut === 1 ? "member" : "members"} tried to say who the payee is after the places were taken.
            Their words are not printed; the document says how many there were.
          </p>
        ) : null}
        {phase === "notice" ? (
          me ? (
            box
          ) : (
            <WalletGate action="identify the payee">
              <span />
            </WalletGate>
          )
        ) : spend.state === "open" ? (
          <p className="text-xs text-muted-foreground">The notice window has closed, so the document takes no more identifications.</p>
        ) : null}
        <TxBlock tx={tx} label={`Identifying the payee of ${spend.label}`} />
      </div>
    </section>
  );
}

// ---- the countersignature ----------------------------------------------------------------------

function Countersign({
  spend,
  phase,
  now,
  me,
  member,
  memberLoading,
  readings,
  onChanged,
}: {
  spend: Spend;
  phase: Phase | null;
  now: number;
  me: string;
  member: Member | null;
  memberLoading: boolean;
  readings: Reading[];
  onChanged: () => void;
}) {
  const tx = useTx((s) => {
    const o = approveOutcome(s);
    if (o.kind === "paid" || o.kind === "counted" || o.kind === "recused") rememberReading(spend.desk, spend.n, me);
    onChanged();
  });
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const outcome = tx.final ? approveOutcome(tx.final) : null;
  const mine = readings.find((r) => r.member === me) ?? null;

  if (spend.state !== "open" && !outcome) return null;

  const isPoster = !!me && spend.poster === me;
  const declared = !!member && (spend.payee === me || member.declared.includes(spend.payee));
  // Late is measured against the gate: the first spend posted to this payee address and not since paid.
  const lateFiled = !!member && member.filedSeq > spend.gateSeq;
  const gateWords = spend.gateSeq === spend.postedSeq ? `the spend is ${spend.postedSeq}` : `the first spend to this payee, still unpaid, is ${spend.gateSeq}`;
  const second = spend.approvals === 1;

  let body: React.ReactNode;
  if (outcome && outcome.kind !== "unknown") {
    body = <Outcome outcome={outcome} spend={spend} hash={tx.hash} />;
  } else if (phase === "notice") {
    body = (
      <p className="text-sm text-muted-foreground">
        Countersignatures open in {span(spend.noticeUntil - now)}, when the notice window closes. A call made before then is
        turned away without spending your attempt. This panel turns into the button by itself.
      </p>
    );
  } else if (phase === "overdue") {
    body = <p className="text-sm text-muted-foreground">The window has closed, so this spend takes no more countersignatures. It can only be expired.</p>;
  } else if (!me) {
    body = (
      <WalletGate action="countersign">
        <span />
      </WalletGate>
    );
  } else if (memberLoading && !member) {
    body = <BlockSkeleton lines={2} className="border-0 bg-transparent p-0" />;
  } else if (!member) {
    body = (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Only members of desk {spend.desk} may countersign, and you have no disclosure on it. You can file one now, but it will be
          newer than this spend, so this spend would refuse you as filed too late. It will count for every spend posted afterwards.
          That is the rule working: nobody may write a disclosure after seeing the spend they want to approve. To be read by
          the validators on your own, use the practice desk, which posts a spend after your disclosure.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="cool" size="sm">
            <Link href="/practice">
              Open the practice desk <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/enrol">File a disclosure here</Link>
          </Button>
        </div>
      </div>
    );
  } else if (isPoster) {
    body = (
      <p className="text-sm text-muted-foreground">
        You posted this spend, and its poster may never countersign it. It needs two other members. Nothing is needed from you; this
        page shows each reading as it lands.
      </p>
    );
  } else if (mine) {
    body = (
      <p className="text-sm text-muted-foreground">
        You have already countersigned this spend; your reading is below. One attempt per member per spend, and a verdict is final.
        Nothing more is needed from you.
      </p>
    );
  } else {
    body = (
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="font-medium">Before you sign: exactly one of these will happen</p>
          <ol className="mt-2 space-y-2 text-muted-foreground">
            <li className={cn(declared && "text-foreground")}>
              <strong className="text-foreground">Refused at once, payee declared.</strong> If the payee is your own address or one
              you declared, the contract refuses with no model asked.{" "}
              {declared ? "That is your case: the payee is an address of yours." : "That is not your case."}
            </li>
            <li className={cn(!declared && lateFiled && "text-foreground")}>
              <strong className="text-foreground">Refused at once, filed too late.</strong> If your disclosure carries a higher
              sequence number than the spend, it is never read against it.{" "}
              {lateFiled ? `That is your case: yours is ${member.filedSeq} and ${gateWords}.` : `That is not your case: yours is ${member.filedSeq} and ${gateWords}.`}
            </li>
            {spend.gateSeq !== spend.postedSeq ? (
              <li>
                <strong className="text-foreground">Refused at once, an earlier reading stands.</strong> If you were read on an
                earlier spend to this same payee and were not clear, that reading stands until a spend to this payee is paid, and
                the contract refuses with no model asked.
              </li>
            ) : null}
            <li className={cn(!declared && !lateFiled && "text-foreground")}>
              <strong className="text-foreground">Read clear, counted.</strong> The validators read your disclosure against the
              document under both branches. If nothing you filed moves either way, your countersignature counts.{" "}
              {second
                ? `Yours would be the second: the fund pays ${gen(spend.amountAtto)} to ${short(spend.payee)} in this same transaction.`
                : "Yours would be the first of two; no money moves yet."}
            </li>
            <li className={cn(!declared && !lateFiled && "text-foreground")}>
              <strong className="text-foreground">Read as moved or unsettled, recused.</strong> If something you filed is better or
              worse off under either branch, or the reading does not settle, you are refused and the recusal is published with its
              two characters. It is not a finding against you.
            </li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            In every case the result is stored and final: one attempt per member per spend. The only exception is a round in which
            no validator could reach a model; then nothing is stored and you may sign again.
          </p>
        </div>
        {lateFiled && !declared ? <LateNote /> : null}
        <WalletGate action="countersign">
          <Button type="button" variant="cool" size="lg" disabled={busy} onClick={() => void tx.start(calls.approve(spend.desk, spend.n))}>
            <Signature /> Countersign {spend.label}
          </Button>
        </WalletGate>
        <p className="text-xs text-muted-foreground">
          {declared || lateFiled
            ? "One transaction, usually under a minute, since no model is asked in your case."
            : "One transaction. The validators each ask their own model, so it usually takes one to two minutes."}
        </p>
      </div>
    );
  }

  return (
    <section className={cn(card, "ring-1 ring-primary/30")} aria-labelledby="sign-title">
      <h2 id="sign-title" className="flex items-center gap-2 text-lg font-semibold">
        <Signature className="size-4 text-primary" /> Countersign
      </h2>
      <div className="mt-3 space-y-4">
        {body}
        <TxBlock tx={tx} label={`Countersigning ${spend.label}`} votes />
      </div>
    </section>
  );
}

/** The late refusal is the rule working; the practice desk is where a newcomer is read alone. */
function LateNote() {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="font-medium">Filed too late is the rule working, not a fault</p>
      <p className="mt-1 text-muted-foreground">
        Every disclosure and every spend takes the next number of one counter, and a disclosure is read only against spends
        with a higher number, so nobody can write one after seeing what they want to approve. A member who enrols after a
        spend exists can only ever be refused on it. To be read by the validators you need a spend posted after your
        disclosure, and the{" "}
        <Link href="/practice" className="text-primary underline-offset-4 hover:underline">
          practice desk
        </Link>{" "}
        gives you one without anybody else present.
      </p>
    </div>
  );
}

/** What the countersignature just did, in words, with what happens next. */
function Outcome({ outcome, spend, hash }: { outcome: ApproveOutcome; spend: Spend; hash: string | null }) {
  if (outcome.kind === "procedural")
    return (
      <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
        <p className="font-medium">The contract refused the call before any reading.</p>
        <p className="text-foreground/90">{sentence(outcome.reason)}</p>
        <p className="text-muted-foreground">Nothing was stored against you and your attempt on this spend is unspent.</p>
      </div>
    );
  if (outcome.kind === "paid")
    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-xl border border-keeps/50 bg-keeps/10 p-4 text-sm">
          <p className="text-base font-semibold text-keeps">Clear, and yours was the second: the spend is paid.</p>
          <p className="text-foreground/90">
            {gen(outcome.paidAtto || spend.amountAtto)} left the fund for <span className="font-mono">{short(outcome.to || spend.payee)}</span> in
            this transaction, after the spend was marked paid. The transfer lands a few seconds after finality.
          </p>
          <PayeeBalance payee={outcome.to || spend.payee} />
          {hash ? (
            <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-primary underline-offset-4 hover:underline">
              See the payment in the explorer
            </a>
          ) : null}
        </div>
        <TokenPair value={outcome.reading.value} />
        <p className="text-sm text-muted-foreground">{outcome.reading.why}</p>
        <p className="text-xs text-muted-foreground">Nothing more can happen to this spend and nobody needs to act.</p>
      </div>
    );
  if (outcome.kind === "counted")
    return (
      <div className="space-y-3">
        <div className="space-y-1 rounded-xl border border-keeps/50 bg-keeps/10 p-4 text-sm">
          <p className="text-base font-semibold text-keeps">Clear: your countersignature is counted, 1 of 2.</p>
          <p className="text-foreground/90">
            No money has moved. One more clear countersignature from another member pays the spend, in that member&apos;s own
            transaction. Nothing more is needed from you.
          </p>
        </div>
        <TokenPair value={outcome.reading.value} />
        <p className="text-sm text-muted-foreground">{outcome.reading.why}</p>
      </div>
    );
  if (outcome.kind === "recused")
    return (
      <div className="space-y-3">
        <div className="space-y-1 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="text-base font-semibold text-gold">
            {outcome.reading.verdict === "late"
              ? "Refused: your disclosure is newer than this spend."
              : outcome.reading.verdict === "declared"
                ? "Refused: the payee is an address of yours."
                : outcome.reading.verdict === "standing"
                  ? `Refused: your reading on ${outcome.reading.standsOn || "an earlier spend to this payee"} still stands.`
                  : "You are recused on this spend."}
          </p>
          <p className="text-foreground/90">
            {outcome.reading.modelAsked
              ? "The refusal is stored and published, and no money moved. It is not a finding against you: it says what your own disclosure, as filed, means for this one decision."
              : "The contract decided this alone, with no model asked. The refusal is stored and published, and no money moved. It is not a finding against you."}
          </p>
        </div>
        <ReadingCard reading={outcome.reading} mine />
        {outcome.reading.verdict === "late" ? <LateNote /> : null}
        <p className="text-xs text-muted-foreground">
          Your attempt on this spend is spent and the verdict is final. The spend can still be carried by two other members, and you
          keep your say on every other spend. Nothing more is needed from you.
        </p>
      </div>
    );
  return null;
}

/** The payee's balance, re-read for half a minute after a payment so the money can be seen to arrive. */
function PayeeBalance({ payee }: { payee: string }) {
  const [balance, setBalance] = React.useState<bigint | null>(null);
  React.useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = async () => {
      try {
        const b = await balanceOf(payee);
        if (alive) setBalance(b);
      } catch {
        /* a dropped balance read is not news */
      }
      if (alive && ++tries < 10) timer = setTimeout(tick, 3000);
    };
    let timer = setTimeout(tick, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [payee]);
  return (
    <p className="text-xs text-muted-foreground">
      {balance === null ? "Reading the payee's balance from the network." : `The payee's balance now reads ${gen(balance)}.`}
    </p>
  );
}

// ---- every reading on the spend ---------------------------------------------------------------

function ReadingsCard({ spend, readings, loading, error, retry, me }: { spend: Spend; readings: Reading[]; loading: boolean; error: string; retry: () => void; me: string }) {
  const counted = [spend.approver1, spend.approver2].filter(Boolean);
  return (
    <section className={card} aria-labelledby="readings-title">
      <h2 id="readings-title" className="text-lg font-semibold">
        Countersignatures and recusals
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every attempt is stored, whatever it found, in the order it was made. The two characters are what the validators agreed on;
        the sentence is the contract&apos;s own.
      </p>
      <div className="mt-4 space-y-3">
        {error && !readings.length ? <ReadError onRetry={retry} detail={error} compact /> : null}
        {spend.attempts === 0 ? (
          <p className="text-sm text-muted-foreground">
            {spend.state === "open" ? "Nobody has countersigned this spend yet." : "Nobody countersigned this spend before it closed."}
          </p>
        ) : loading && !readings.length ? (
          <BlockSkeleton lines={3} className="border-0 bg-transparent p-0" />
        ) : (
          readings.map((r) => (
            <div key={r.member + r.attempt} className="space-y-1">
              <ReadingCard reading={r} mine={r.member === me} />
              {counted.includes(r.member) ? (
                <p className="pl-1 text-[11px] text-keeps">Counted as clear countersignature {counted.indexOf(r.member) + 1} of 2.</p>
              ) : null}
            </div>
          ))
        )}
        {spend.posterTried > 0 ? (
          <p className="text-xs text-muted-foreground">
            The poster tried to countersign this spend {spend.posterTried} {spend.posterTried === 1 ? "time" : "times"}. Each try was
            refused before any reading, and the count is kept on the spend itself.
          </p>
        ) : null}
        {spend.attempts > 0 ? (
          <p className="text-xs text-muted-foreground">
            Calls refused before any reading (the poster trying to sign, a call during the notice window) are not readings. They are
            kept in the desk&apos;s refusal ring, shown on the{" "}
            <Link href="/ledger" className="text-primary underline-offset-4 hover:underline">
              ledger
            </Link>
            .
          </p>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Link to this spend: <span className="font-mono">{spendPath(spend.desk, spend.n)}</span>
        </p>
      </div>
    </section>
  );
}
