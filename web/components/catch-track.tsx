"use client";

// The practice desk's second track, "catch a hidden conflict": the rows a visitor follows from one
// click to a bounty paid out of a stake, in one transaction. The script is lib/catch.ts and the
// engine lib/catch-engine.ts; this file only shows the state and passes on the visitor's clicks.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, FlaskConical, Gavel, Hourglass, Play, RotateCcw, ShieldAlert, TriangleAlert, Undo2, Wallet } from "lucide-react";

import { Address } from "@/components/address";
import { ActionLine, StepRow, WrongWallet } from "@/components/practice-rows";
import { NoRegister } from "@/components/read-state";
import { ReadingCard } from "@/components/reading";
import { SectionHelp } from "@/components/section-help";
import { Suggest } from "@/components/suggest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChainSeconds } from "@/components/use-clock";
import { useLocal } from "@/components/use-local";
import { useMe } from "@/components/use-me";
import { ChallengeCard, WaitPanel } from "@/components/v2";
import { WalletGate } from "@/components/wallet-gate";
import {
  BOND_DEPOSIT_ATTO,
  CAST,
  HOLD_MINUTES,
  HOLD_ROOM_S,
  POT_ATTO,
  ROLES,
  SIGNER,
  SPEND,
  STAKE_ATTO,
  blocked,
  clearCount,
  countedSigners,
  holdOver,
  maraCounted,
  otherSigner,
  pageOf,
  reserveNeeded,
  rowPhase,
  tryUrl,
  type ActionId,
  type CatchState,
  type RowId,
  type Signer,
  type Try,
} from "@/lib/catch";
import * as engine from "@/lib/catch-engine";
import type { CatchView } from "@/lib/catch-engine";
import { CHALLENGE_BOND_ATTO, contractAddress, isMock, memberPath, spendPath } from "@/lib/chain";
import { REGISTRY_COMMIT } from "@/lib/config";
import { gen, minutesLabel, short, span, toAtto } from "@/lib/format";
import { BOND_SUGGESTIONS } from "@/lib/suggestions";
import { waitingCopy } from "@/lib/waiting";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";
const link = "text-primary underline-offset-4 hover:underline";
const ORDER: RowId[] = ["accounts", "desk", "spend", "signs", "bond", "catch"];
const NAME: Record<Signer, string> = { mara: CAST.mara.publicName, tomas: CAST.tomas.publicName, elin: CAST.elin.publicName };

export function CatchTrack() {
  const view = React.useSyncExternalStore(engine.subscribe, engine.snapshot, engine.serverSnapshot);
  const me = useMe();
  const hasRegister = useLocal(() => isMock || !!contractAddress(), true);
  const s = view.state;
  const started = s.startedAt > 0;
  const registry = engine.catchRegistry();

  React.useEffect(() => engine.attach(), []);
  React.useEffect(() => {
    engine.setVisitor(me.address);
  }, [me.address]);

  const now = useChainSeconds(view.clock);
  const chainNow = view.clock ? now : 0;
  const current = ORDER.find((id) => {
    const p = rowPhase(s, id);
    return p !== "done" && p !== "recused";
  });

  return (
    <div className="space-y-6" data-track-body="catch">
      <section className={cn(card, "space-y-3 text-sm")} aria-labelledby="catch-held-title">
        <h2 id="catch-held-title" className="flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="size-4 text-primary" /> What the page holds, and what is yours
          <SectionHelp k="practice-catch" />
        </h2>
        <p className="text-foreground/90">
          The page makes four practice accounts in this browser, plus an address that stands for Gull Catering Ltd and never signs.
          They are nobody&apos;s wallet and hold test GEN only; their keys stay in this browser so a reload carries on.
        </p>
        <ul className="space-y-1.5 text-muted-foreground">
          {ROLES.map((r) => (
            <li key={r} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-foreground">{CAST[r].publicName}</span>
              <span>{CAST[r].part}.</span>
              {started ? <Address value={s.addresses[r]} className="text-xs" /> : null}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          You are the only person here, and you are the one who catches her. Your bond credit and your challenge are signed by your own
          wallet and nothing else; nothing you do touches a stake of yours.{" "}
          {isMock
            ? "This is demo mode: the register page is read from a copy in the site and judged by a fixed rule, not by validators, as the bar above says."
            : "Every validator fetches the register page on the live web and reads it itself; nothing is decided in advance."}
        </p>
      </section>

      {!hasRegister ? (
        <NoRegister />
      ) : !view.loaded ? null : !started ? (
        <StartCard watching={view.watching} registry={registry} />
      ) : (
        <>
          {view.watching ? (
            <p role="status" className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
              This track is running in another tab of this browser. This tab shows its progress and sends nothing, so that no step is made twice.
            </p>
          ) : null}
          <ol className="space-y-3">
            <AccountsRow view={view} active={current === "accounts"} />
            <DeskRow view={view} active={current === "desk"} />
            <SpendRow view={view} now={chainNow} active={current === "spend"} />
            <SignsRow view={view} now={chainNow} active={current === "signs"} />
            <BondRow view={view} me={me.address} balance={me.balanceAtto} active={current === "bond"} />
            <CatchRow view={view} me={me.address} now={chainNow} active={current === "catch"} />
          </ol>
          <Afterwards view={view} now={chainNow} />
        </>
      )}
    </div>
  );
}

// ---- before it starts -------------------------------------------------------------------------

function StartCard({ watching, registry }: { watching: boolean; registry: string }) {
  return (
    <section className={cn(card, "space-y-4")} aria-labelledby="catch-start-title">
      <h2 id="catch-start-title" className="text-lg font-semibold">
        Six steps, two of them yours
      </h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>The page makes four practice accounts and asks the test faucet for 10 test GEN each.</li>
        <li>
          Ines opens a desk with a pot of {gen(POT_ATTO)}, a member stake of {gen(STAKE_ATTO)}, a hold of {minutesLabel(HOLD_MINUTES)}, and
          one public register: the Estuary Companies Register in this repository. Four members enrol and stake.
        </li>
        <li>Ines posts a spend of {gen(SPEND.amountAtto)} to Gull Catering Ltd. Its notice window runs: five minutes.</li>
        <li>
          Mara Quist and Tomas Brandt countersign, and both read clear. Mara directs Gull Catering, but her disclosure only names her print
          shop, and a reading can only read what was filed. The spend goes into its hold.
        </li>
        <li className="text-foreground">You put up {gen(CHALLENGE_BOND_ATTO)} or more of bond credit, with your wallet.</li>
        <li className="text-foreground">
          You cite the register&apos;s Gull Catering page against Mara&apos;s signature. Every validator reads it; her signature is struck and
          half her stake is paid to you, in that transaction.
        </li>
      </ol>
      {registry ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="cool" size="lg" disabled={watching} onClick={() => engine.start()}>
            <Play /> Set up the register desk
          </Button>
          <p className="text-xs text-muted-foreground">
            About fifteen minutes: five of them the notice window, and the hold gives you {minutesLabel(HOLD_MINUTES)} to cite the page. You
            need a little test GEN for the bond.
          </p>
        </div>
      ) : (
        <div role="note" className="space-y-1 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <p className="font-medium">This track cannot start on this site yet.</p>
          <p className="text-foreground/85">
            The desk names its register for good when it is opened, and every validator must fetch the same bytes for as long as the desk
            lives, so the register pages are read from this repository at one commit. This site has not been given that commit yet (
            <code className="font-mono text-xs">REGISTRY_COMMIT</code> in <code className="font-mono text-xs">web/lib/config.ts</code> is
            empty), and a branch could change under a desk. It opens as soon as the commit is set. The demo mode of this site runs the track
            on the in-memory contract.
          </p>
        </div>
      )}
      {watching ? <p className="text-xs text-gold">Another tab of this browser has this page open and would run the same steps. Use that tab, or close it.</p> : null}
    </section>
  );
}

// ---- the rows ---------------------------------------------------------------------------------

function Row({ n, id, title, view, active, children }: { n: number; id: RowId; title: string; view: CatchView; active: boolean; children: React.ReactNode }) {
  return (
    <StepRow n={n} id={id} title={title} phase={rowPhase(view.state, id)} active={active}>
      {children}
    </StepRow>
  );
}

function Line({ id, label, view, judged }: { id: ActionId; label: string; view: CatchView; judged?: boolean }) {
  return (
    <ActionLine
      id={id}
      label={label}
      action={view.state.actions[id]}
      live={view.live[id]}
      held={SIGNER[id] !== "you"}
      judged={judged}
      onRetry={() => engine.retry(id)}
    />
  );
}

function AccountsRow({ view, active }: { view: CatchView; active: boolean }) {
  const s = view.state;
  return (
    <Row n={1} id="accounts" title="Four practice accounts" view={view} active={active}>
      <p className="text-muted-foreground">
        {rowPhase(s, "accounts") === "done"
          ? "Four keys were made in this browser and each holds test GEN from Studio's faucet, for the pot and the stakes. Next: Ines opens the desk."
          : "The page has made four keys in this browser and is asking Studio's test faucet for 10 test GEN for each. A few seconds."}
      </p>
      <ul className="space-y-1.5">
        {ROLES.map((r) => (
          <Line key={r} id={("fund" + r.charAt(0).toUpperCase() + r.slice(1)) as ActionId} view={view} label={`${CAST[r].publicName}, ${short(s.addresses[r])}: 10 test GEN from the faucet`} />
        ))}
      </ul>
    </Row>
  );
}

function DeskRow({ view, active }: { view: CatchView; active: boolean }) {
  const s = view.state;
  return (
    <Row n={2} id="desk" title="A desk that names a public register, and four members who stake" view={view} active={active}>
      <p className="text-muted-foreground">
        Ines opens {s.label} with {gen(POT_ATTO)} in the pot, a member stake of {gen(STAKE_ATTO)} and a hold of {minutesLabel(HOLD_MINUTES)}, and
        names one register, for good, before any spend exists:
      </p>
      <a href={s.registry + "index.html"} target="_blank" rel="noopener noreferrer" className="block font-mono text-xs break-all text-primary underline-offset-4 hover:underline">
        {s.registry} <ExternalLink className="inline size-3" />
      </a>
      <ul className="space-y-1.5">
        <Line id="open" view={view} label={`Ines opens the desk with ${gen(POT_ATTO)}, naming the register`} />
        {ROLES.map((r) => (
          <Line key={r} id={("enrol" + r.charAt(0).toUpperCase() + r.slice(1)) as ActionId} view={view} label={`${CAST[r].publicName} files a disclosure and stakes ${gen(STAKE_ATTO)}`} />
        ))}
      </ul>
      <details className="rounded-lg border bg-background/40 px-3 py-2 text-xs" open={rowPhase(s, "desk") === "done"}>
        <summary className="cursor-pointer text-foreground/90">What each member files, and what Mara leaves out</summary>
        <ul className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <li key={r} className="space-y-1">
              <p className="font-medium text-foreground">
                {CAST[r].publicName}
                {s.members[r] ? <span className="font-normal text-muted-foreground"> · member {s.members[r]!.number}, sequence number {s.members[r]!.filedSeq}</span> : null}
              </p>
              <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{CAST[r].statement}</blockquote>
              {CAST[r].entries.map((e) => (
                <p key={e.name} className="text-muted-foreground">
                  <span className="text-foreground">{e.name}</span>: {e.relation.replace(/_/g, " ")}. {e.detail}
                </p>
              ))}
              {r === "mara" ? (
                <p className="text-gold">
                  Left out: Mara Quist has been a director of Gull Catering Ltd since 2019 and holds 40 percent of it. The register says so; her
                  disclosure never does.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </Row>
  );
}

function SpendRow({ view, now, active }: { view: CatchView; now: number; active: boolean }) {
  const s = view.state;
  const sp = s.spend;
  return (
    <Row n={3} id="spend" title="Ines posts a spend to Gull Catering, and its notice window runs" view={view} active={active}>
      <p className="text-muted-foreground">
        {sp
          ? `S${sp.n}: ${gen(SPEND.amountAtto)} to Gull Catering Ltd, posted at sequence number ${sp.postedSeq}. Its amount is set aside in the pot. Nobody may countersign until the notice window closes.`
          : `Once every member has enrolled, Ines posts ${gen(SPEND.amountAtto)} to Gull Catering Ltd with the shortest notice window the contract takes.`}
      </p>
      <ul className="space-y-1.5">
        <Line id="post" view={view} label={`Ines posts ${gen(SPEND.amountAtto)} to Gull Catering Ltd`} />
      </ul>
      {sp ? (
        <div className="space-y-1 rounded-lg border bg-background/40 px-3 py-2 text-xs">
          <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{SPEND.description}</blockquote>
          <p className="text-muted-foreground">
            The payee is a fresh address held in this browser that stands for Gull Catering Ltd: <Address value={s.addresses.gull} className="text-xs" />.{" "}
            <Link href={spendPath(s.desk, sp.n)} className={link}>
              Open S{sp.n} on its own page
            </Link>
            .
          </p>
        </div>
      ) : null}
      {sp && !s.readings.mara ? (
        now ? (
          now < sp.noticeUntil ? (
            <div className="space-y-2 rounded-xl border bg-background/40 p-3" data-countdown={`S${sp.n}`}>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <Hourglass className="size-4 text-primary" /> Countersignatures on S{sp.n} open in <span className="font-mono">{span(sp.noticeUntil - now)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                Counted on the chain&apos;s own clock. Nothing is needed from you; you may put up your bond credit in step 5 now, so that only the
                challenge has to fit in the hold. A reload carries on.
              </p>
              {isMock ? (
                <Button type="button" variant="outline" size="sm" onClick={() => engine.skipWait()}>
                  Demo mode only: skip the wait
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-keeps">The notice window has closed and the document is sealed. Mara countersigns first.</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">Reading the chain&apos;s clock.</p>
        )
      ) : null}
    </Row>
  );
}

function SignsRow({ view, now, active }: { view: CatchView; now: number; active: boolean }) {
  const s = view.state;
  const reserve = reserveNeeded(s) || s.actions.signElin.phase !== "waiting";
  const counted = countedSigners(s);
  return (
    <Row n={4} id="signs" title="Two clear countersignatures, and the spend goes into its hold" view={view} active={active}>
      {!s.readings.mara ? (
        <p className="text-muted-foreground">
          Mara countersigns first, then Tomas. Each is read by the validators against what they filed, under both branches of the decision.
          Mara filed a print shop; this spend buys refreshments; so nothing she filed moves, and she should read clear. That is the limit
          version 1 admitted: a reading reads what was filed, and cannot know what was left out.
        </p>
      ) : s.held ? (
        <p className="text-foreground/90">
          Two clear readings are counted ({counted.map((k) => NAME[k]).join(" and ")}), so S{s.spend?.n} is in its hold. Nothing has been paid:
          for {minutesLabel(HOLD_MINUTES)} anyone may cite a page of the desk&apos;s register against either signature.
          {maraCounted(s) ? " Mara's is one of them, and the register knows what she left out." : ""}
        </p>
      ) : (
        <p className="text-muted-foreground">
          {clearCount(s)} clear {clearCount(s) === 1 ? "reading" : "readings"} so far, and the spend needs two.
          {reserve ? " Elin, held in reserve for exactly this, countersigns." : ""}
        </p>
      )}
      {s.readings.mara && s.readings.mara.verdict !== "clear" ? (
        <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
          Mara was not read clear this time, so her countersignature was refused and never counted: there is no signature of hers to strike.
          A reading can come back unsettled, and the contract stores it as it is. A new practice desk gives a fresh run.
        </p>
      ) : null}
      <ul className="space-y-1.5">
        <Line id="signMara" view={view} label="Mara Quist countersigns" judged />
        <Line id="signTomas" view={view} label="Tomas Brandt countersigns" judged />
        {reserve ? <Line id="signElin" view={view} label="Elin Varga countersigns, from reserve" judged /> : null}
      </ul>
      {s.held ? (
        <WaitPanel
          tone="busy"
          title={now ? (now < s.held.until ? `In its hold for another ${span(s.held.until - now)}` : "The hold has ended") : "In its hold"}
          lines={waitingCopy(
            {
              kind: "holding",
              label: `S${s.spend?.n ?? ""}`,
              now,
              holdUntil: s.held.until,
              amountAtto: SPEND.amountAtto.toString(),
              stakeAtto: STAKE_ATTO.toString(),
              bondAtto: CHALLENGE_BOND_ATTO.toString(),
              challenges: Object.keys(s.results).length,
            },
            "challenger",
          )}
        />
      ) : null}
      {(["mara", "tomas", "elin"] as Signer[]).map((k) => (s.readings[k] ? <ReadingCard key={k} reading={s.readings[k]!} className="bg-background/40" /> : null))}
    </Row>
  );
}

function BondRow({ view, me, balance, active }: { view: CatchView; me: string; balance: bigint; active: boolean }) {
  const s = view.state;
  const a = s.actions.deposit;
  const [amount, setAmount] = React.useState(gen(BOND_DEPOSIT_ATTO, ""));
  const [error, setError] = React.useState("");
  const busy = a.phase === "checking" || a.phase === "signing" || a.phase === "onchain";
  const why = blocked(s, "deposit", 0);
  const wrong = !!s.visitor && !!me && me !== s.visitor;
  const credit = BigInt(s.credit || "0");

  const send = () => {
    setError("");
    let value: bigint;
    try {
      value = toAtto(amount);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Enter an amount.");
    }
    if (value < CHALLENGE_BOND_ATTO) return setError(`A challenge stakes ${gen(CHALLENGE_BOND_ATTO)}; deposit at least that.`);
    if (value > balance) return setError(`Your wallet holds ${gen(balance)}. The wallet menu at the top right gets 10 test GEN from the faucet.`);
    engine.depositBond(value);
  };

  return (
    <Row n={5} id="bond" title="You put up bond credit, with your own wallet" view={view} active={active}>
      <p className="text-muted-foreground">
        A challenge stakes {gen(CHALLENGE_BOND_ATTO)} of bond credit. It is how the contract makes a wrong accusation cost something: if the page
        names the member and shows nothing they hid, the bond goes to them. A page that proves a hidden relation costs you nothing, and a page
        that settles nothing costs nothing either. Bond credit is yours, tied to no desk, and comes back whenever you withdraw it.
      </p>
      {a.phase === "done" ? (
        <p className="text-foreground/90">
          Your bond credit: <strong>{gen(credit)}</strong>, enough for {(credit / CHALLENGE_BOND_ATTO).toString()}{" "}
          {credit / CHALLENGE_BOND_ATTO === 1n ? "challenge" : "challenges"}.
          {a.found ? " It was already there, so no deposit was needed." : ""}
        </p>
      ) : null}
      {wrong ? <WrongWallet expected={s.visitor} me={me} /> : null}
      {a.phase !== "done" || credit < CHALLENGE_BOND_ATTO ? (
        <WalletGate action="put up bond credit">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="catch-bond" className="text-xs text-muted-foreground">
                  Deposit (GEN)
                </label>
                <Input id="catch-bond" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-28" disabled={busy} />
              </div>
              <Button type="button" variant="cool" disabled={busy || !!why || !me || view.watching || wrong} onClick={send}>
                <Wallet /> Deposit bond credit
              </Button>
            </div>
            <Suggest options={BOND_SUGGESTIONS.map((o) => ({ label: o.label, value: gen(o.value, "") }))} onPick={setAmount} disabled={busy} />
            <p className="text-xs text-muted-foreground">
              {why ? `Not yet: ${why}.` : `${gen(BOND_DEPOSIT_ATTO)} covers the catch and both tries before it. One transaction, a few seconds; you may do it during the notice window.`}
            </p>
            {error ? <p className="text-xs text-gold">{error}</p> : null}
          </div>
        </WalletGate>
      ) : null}
      {a.hash || a.last || a.note || busy ? (
        <ul className="space-y-1.5">
          <Line id="deposit" view={view} label="Your deposit of bond credit" />
        </ul>
      ) : null}
    </Row>
  );
}

function TryButton({ t, s, now, view, label, primary }: { t: Try; s: CatchState; now: number; view: CatchView; label: string; primary?: boolean }) {
  const id: ActionId = t === "clean" ? "tryClean" : t === "unclear" ? "tryUnclear" : "catchIt";
  const a = s.actions[id];
  const why = blocked(s, id, now);
  const busy = a.phase === "checking" || a.phase === "signing" || a.phase === "onchain";
  const result = s.results[t];
  if (result) return null;
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={primary ? "cool" : "outline"}
        size={primary ? "lg" : "sm"}
        className={primary ? "max-w-full" : "h-auto max-w-full py-1.5 text-left whitespace-normal"}
        disabled={!!why || busy || view.watching}
        onClick={() => engine.cite(t)}
      >
        {primary ? <ShieldAlert /> : <Gavel />} {label}
      </Button>
      {why && !busy ? <p className="text-xs text-muted-foreground">Not yet: {why}.</p> : null}
    </div>
  );
}

function CatchRow({ view, me, now, active }: { view: CatchView; me: string; now: number; active: boolean }) {
  const s = view.state;
  const n = s.spend?.n ?? 0;
  const other = otherSigner(s);
  const left = s.held ? s.held.until - now : 0;
  const inFlight = (["tryClean", "tryUnclear", "catchIt"] as ActionId[]).find((id) => {
    const p = s.actions[id].phase;
    return p === "signing" || p === "onchain";
  });
  const flightTry: Try | null = inFlight === "tryClean" ? "clean" : inFlight === "tryUnclear" ? "unclear" : inFlight === "catchIt" ? "catch" : null;
  const caught = s.results.catch;
  const wrong = !!s.visitor && !!me && me !== s.visitor;
  const bal = view.balances.you ?? "";
  const landed = !!caught && !!s.balanceBefore && bal !== "" && BigInt(bal) >= BigInt(s.balanceBefore) + BigInt(caught.bountyAtto);
  const gull = pageOf("catch");

  return (
    <Row n={6} id="catch" title="You cite the register page, and every validator reads it" view={view} active={active}>
      {!caught ? (
        <p className="text-muted-foreground">
          The page below is a page of the register the desk named before the spend existed. You cite it against Mara&apos;s signature. Every
          validator fetches it from the web itself, keeps a fingerprint of what it read, and asks two questions in two presentation orders:
          does the page show a relation between Mara Quist and the payee that her disclosure does not mention, and is it silent about any
          such relation. They must agree on the finding and the fingerprint, or nothing is stored and no bond is taken.
        </p>
      ) : null}
      <div className="space-y-1 rounded-lg border bg-background/40 p-3 text-xs">
        <p className="text-muted-foreground">The page you cite: {gull.company}</p>
        <a href={tryUrl(s, "catch")} target="_blank" rel="noopener noreferrer" className="font-mono break-all text-primary underline-offset-4 hover:underline">
          {tryUrl(s, "catch")} <ExternalLink className="inline size-3" />
        </a>
        <p className="text-foreground/85">{gull.shows}.</p>
      </div>
      {s.held && now && !caught && left > 0 && left < HOLD_ROOM_S ? (
        <p className="flex items-start gap-1.5 text-xs text-gold">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> Only {span(left)} of the hold is left. A round takes one to three minutes; one that
          lands after the hold has ended is refused before any page is fetched, and no bond is taken.
        </p>
      ) : null}
      {wrong ? <WrongWallet expected={s.visitor} me={me} /> : null}
      {!caught && s.held && !holdOver(s, now) ? (
        <WalletGate action="cite the register page">
          <div className="space-y-3">
            <TryButton t="catch" s={s} now={now} view={view} label="Catch Mara Quist: cite the Gull Catering page" primary />
            <div className="space-y-2 rounded-lg border bg-background/40 p-3 text-xs">
              <p className="font-medium text-foreground">Or first, see the other two findings (optional, before the catch)</p>
              <p className="text-muted-foreground">
                The hold ends when her signature is struck, so these come first. The Pelican Press page names Mara only for the print shop she
                filed: clean, so your bond goes to her. The Heron Signs page never names {other ? NAME[other] : "the other signer"}: unclear, and
                your bond stays in your credit.
              </p>
              <div className="flex flex-wrap gap-3">
                <TryButton t="clean" s={s} now={now} view={view} label="Cite Pelican Press against Mara (clean)" />
                <TryButton t="unclear" s={s} now={now} view={view} label={`Cite Heron Signs against ${other ? NAME[other] : "the other signer"} (unclear)`} />
              </div>
            </div>
          </div>
        </WalletGate>
      ) : null}
      {flightTry ? (
        <WaitPanel
          tone="busy"
          title="The validators are reading the page."
          lines={waitingCopy(
            {
              kind: "challenge",
              label: `S${n}`,
              publicName: flightTry === "unclear" && other ? NAME[other] : CAST.mara.publicName,
              page: pageOf(flightTry).file,
              bondAtto: CHALLENGE_BOND_ATTO.toString(),
              stakeAtto: STAKE_ATTO.toString(),
              amountAtto: SPEND.amountAtto.toString(),
            },
            "challenger",
          )}
        />
      ) : null}
      <ul className="space-y-1.5">
        {(["tryClean", "tryUnclear", "catchIt"] as ActionId[]).map((id) => {
          const a = s.actions[id];
          if (!(a.hash || a.last || a.note || a.phase !== "waiting")) return null;
          const label = id === "catchIt" ? "Your challenge: the Gull Catering page against Mara" : id === "tryClean" ? "Your try: the Pelican Press page against Mara" : "Your try: the Heron Signs page against the other signer";
          return <Line key={id} id={id} view={view} label={label} judged />;
        })}
      </ul>
      {(["clean", "unclear"] as Try[]).map((t) => (s.results[t] ? <ChallengeCard key={t} c={s.results[t]!} me={s.visitor || me} hash={s.actions[t === "clean" ? "tryClean" : "tryUnclear"].hash} /> : null))}
      {caught ? (
        <>
          <div className={cn("space-y-2 rounded-xl border p-4 text-sm", caught.verdict === "hidden" ? "border-breaks/50 bg-breaks/10" : "border-gold/40 bg-gold/10")}>
            <p className="text-base font-semibold">
              {caught.verdict === "hidden"
                ? `Caught. Mara Quist's signature is struck, and ${gen(caught.bountyAtto)} of her stake was paid to you in that transaction.`
                : `The validators read the page as ${caught.verdict}. Nothing was struck.`}
            </p>
            {caught.verdict === "hidden" ? (
              <WaitPanel
                lines={waitingCopy(
                  {
                    kind: "struck",
                    label: `S${n}`,
                    publicName: CAST.mara.publicName,
                    slashedAtto: caught.slashedAtto,
                    bountyAtto: caught.bountyAtto,
                    toDeskAtto: caught.toDeskAtto,
                    amountAtto: SPEND.amountAtto.toString(),
                    expired: caught.stateAfter === "expired",
                  },
                  "challenger",
                )}
              />
            ) : (
              <p className="text-foreground/85">
                A reading of a live page can come back unsettled, and the contract stores it as it is. Your bond stayed in your credit. A new
                practice desk gives a fresh run.
              </p>
            )}
            {caught.verdict === "hidden" && s.balanceBefore ? (
              <p className={cn("text-xs", landed ? "text-keeps" : "text-muted-foreground")} data-bounty={landed ? "landed" : "pending"}>
                {landed
                  ? `It has arrived: your wallet went from ${gen(s.balanceBefore)} to ${gen(bal)}.`
                  : `Your wallet read ${gen(s.balanceBefore)} before the challenge${bal ? ` and reads ${gen(bal)} now` : ""}; the transfer lands when the transaction is finalized, about half a minute after it is accepted.`}
              </p>
            ) : null}
          </div>
          <ChallengeCard c={caught} me={s.visitor || me} hash={s.actions.catchIt.hash} />
        </>
      ) : null}
      {!caught && s.held && holdOver(s, now) ? (
        <p className="rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
          The hold ran out before a page was cited against Mara&apos;s signature, so it stands. Anyone may now release S{n} from{" "}
          <Link href={spendPath(s.desk, n)} className={link}>
            its page
          </Link>
          , which pays Gull Catering. That is the hold working too: it is a window, not a promise that someone looks. A new practice desk gives a
          fresh run.
        </p>
      ) : null}
    </Row>
  );
}

// ---- afterwards -------------------------------------------------------------------------------

function Afterwards({ view, now }: { view: CatchView; now: number }) {
  const s = view.state;
  const [sure, setSure] = React.useState(false);
  const caught = s.results.catch;
  const credit = BigInt(s.credit || "0");
  const w = s.actions.withdraw;
  const busy = w.phase === "checking" || w.phase === "signing" || w.phase === "onchain";
  return (
    <section className={cn(card, "space-y-3 text-sm")} aria-labelledby="catch-after-title">
      <h2 id="catch-after-title" className="text-lg font-semibold">
        {caught?.verdict === "hidden" ? "What you have just seen" : "While it runs"}
      </h2>
      {caught?.verdict === "hidden" ? (
        <p className="text-muted-foreground">
          A member who hid a relation to the payee read clear, because a reading reads only what was filed. During the hold, a page of a
          register the desk named before the spend existed was fetched by every validator on the live web, and they agreed it shows the
          relation she left out. In that one transaction her signature was struck, the payment stopped, and her stake paid the whistleblower.
          S{s.spend?.n} is open again and needs one more clear countersignature; Mara&apos;s reading stands struck for every spend to Gull
          Catering until one is paid, and her stake must be restaked before she may countersign anything on this desk.
        </p>
      ) : (
        <p className="text-muted-foreground">
          You can leave this page and come back, or reload it: the track is kept in this browser, and before any step is sent again the page
          reads the chain to see whether it already landed.{s.held && now ? ` The hold runs on the chain either way, for another ${span(Math.max(0, s.held.until - now))}.` : ""}
        </p>
      )}
      {s.desk ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/desk?desk=${s.desk}`}>
              Open {s.desk} on the desk page <ArrowRight />
            </Link>
          </Button>
          {s.spend ? (
            <Button asChild variant="outline" size="sm">
              <Link href={spendPath(s.desk, s.spend.n)}>
                S{s.spend.n} and its challenges <ArrowRight />
              </Link>
            </Button>
          ) : null}
          {s.desk && s.addresses.mara ? (
            <Button asChild variant="outline" size="sm">
              <Link href={memberPath(s.desk, s.addresses.mara)}>
                Mara Quist&apos;s public record <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {credit > 0n && s.actions.deposit.phase === "done" ? (
        <div className="space-y-1 rounded-lg border bg-background/40 p-3 text-xs">
          <p className="text-foreground/90">You hold {gen(credit)} of bond credit. It is yours and tied to no desk.</p>
          <Button type="button" variant="outline" size="sm" disabled={busy || view.watching || !!blocked(s, "withdraw", now)} onClick={() => engine.withdrawBond()}>
            <Undo2 /> Withdraw it to my wallet
          </Button>
        </div>
      ) : null}
      {w.hash || w.last || w.note || busy ? (
        <ul className="space-y-1.5">
          <Line id="withdraw" view={view} label="Your bond credit, withdrawn" />
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        {!sure ? (
          <Button type="button" variant="ghost" size="sm" disabled={view.watching} onClick={() => setSure(true)}>
            <RotateCcw /> Start a new register desk
          </Button>
        ) : (
          <>
            <p className="flex items-start gap-1.5 text-xs text-gold">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              This forgets the practice accounts and this desk in this browser. What is on chain stays on chain{credit > 0n ? ", your bond credit included" : ""}.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSure(false);
                engine.reset();
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
      {!REGISTRY_COMMIT && isMock ? (
        <p className="text-[11px] text-muted-foreground">Demo mode names the branch head of the register, because no page is fetched here; on the chain the track waits for a pinned commit.</p>
      ) : null}
    </section>
  );
}
