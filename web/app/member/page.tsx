"use client";

// One member of a desk, as version 2 keeps them: the public name a register would list them
// under, the stake they put up and the signatures it still answers for, and the public record of
// hidden conflicts proven against them and challenges they survived. On your own page, the three
// things only you may do to your stake: restake after a slash, retire, and take the stake back.
// ?desk=D1&addr=0x… opens another member's page; with no address it is your own.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, LogOut, PiggyBank, RotateCcw, ShieldAlert, Undo2 } from "lucide-react";

import { Address } from "@/components/address";
import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { SectionHelp } from "@/components/section-help";
import { TxBlock } from "@/components/tx-block";
import { Button } from "@/components/ui/button";
import { useDeskId } from "@/components/use-desk";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { succeeded, useTx } from "@/components/use-tx";
import { VersionOneNotice, WaitPanel } from "@/components/v2";
import { WalletGate } from "@/components/wallet-gate";
import { calls, readBondCredit, readDesk, readMember, type Desk, type Member } from "@/lib/chain";
import { gen, minutesLabel, when } from "@/lib/format";
import { isAddress } from "@/lib/register";
import { waitingCopy } from "@/lib/waiting";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";

const addressInUrl = (): string => {
  const raw = new URLSearchParams(window.location.search).get("addr") ?? "";
  return isAddress(raw) ? raw.toLowerCase() : "";
};
const unchanging = () => () => {};

/** The address a link asked for, read in the browser; "" means the visitor's own page. */
function useAddressParam(): string {
  return React.useSyncExternalStore(unchanging, addressInUrl, () => "");
}

export default function MemberPage() {
  const deskId = useDeskId();
  const me = useMe();
  const asked = useAddressParam();
  const who = asked || me.address;
  const own = !!who && who === me.address;
  const desk = useRead(() => readDesk(deskId), [deskId]);
  const member = useRead(() => readMember(deskId, who), [deskId, who], { enabled: !!who && !!desk.data });
  const refresh = () => {
    void desk.refresh();
    void member.refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">Member of desk {deskId}</p>
        <h1 className="text-3xl font-bold tracking-tight">{own || !asked ? "Your stake and public record" : "A member's stake and public record"}</h1>
        <p className="text-muted-foreground">
          Every member stakes to sign. The stake answers for each countersignature until the spend it was given on ends: a page of a
          public register the desk named, read by every validator, that shows a relation to the payee the member never disclosed
          slashes the whole of it. The record below counts what such pages found, and no rule of the contract reads it.
        </p>
      </div>
      <VersionOneNotice />

      {!who ? (
        <WalletGate action="see your own stake">
          <span />
        </WalletGate>
      ) : (
        <ReadBlock
          state={desk}
          skeleton={<BlockSkeleton lines={4} />}
          empty={
            <div className={cn(card, "space-y-2 text-sm")}>
              <p className="font-medium">This register has no desk {deskId}.</p>
              <Button asChild variant="cool" size="sm">
                <Link href="/desk">
                  Choose a desk <ArrowRight />
                </Link>
              </Button>
            </div>
          }
        >
          {(d) =>
            member.loading && !member.data ? (
              <BlockSkeleton lines={5} />
            ) : member.error && !member.data ? (
              <ReadError onRetry={member.retry} detail={member.error} />
            ) : !member.data ? (
              <div className={cn(card, "space-y-3 text-sm")}>
                <p className="font-medium">{own ? "You are not a member of this desk." : "That address is not a member of this desk."}</p>
                <p className="text-muted-foreground">
                  {own
                    ? `Enrolling files your disclosure and stakes ${gen(d.memberStakeAtto)}, which stays yours: retire and take it back once nothing you signed is open.`
                    : "Members are listed on the desk page, each with a link to this page."}
                </p>
                <Button asChild variant="cool" size="sm">
                  <Link href={own ? "/enrol" : "/desk"}>
                    {own ? `Enrol on ${d.id}` : "See the members"} <ArrowRight />
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <Record desk={d} m={member.data} />
                {own ? <YourStake desk={d} m={member.data} onChanged={refresh} /> : null}
                <BondCredit who={who} own={own} />
                <div className={cn(card, "space-y-3 text-sm")}>
                  <p className="font-medium">The disclosure on file</p>
                  <blockquote className="border-l-2 border-primary/50 pl-3 text-foreground/90">{member.data.statement}</blockquote>
                  <ul className="space-y-1.5">
                    {member.data.entries.map((e, i) => (
                      <li key={i} className="rounded-lg border bg-background/40 px-3 py-2 text-xs">
                        <span className="font-medium text-foreground">{e.name}</span>
                        <span className="text-muted-foreground">: {e.relationPhrase}.</span>
                        {e.detail ? <span className="text-foreground/80"> {e.detail}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Version {member.data.version}, filed at sequence number {member.data.filedSeq}
                    {member.data.filedAt ? `, ${when(member.data.filedAt)}` : ""}.{" "}
                    {own ? (
                      <Link href="/enrol" className="text-primary underline-offset-4 hover:underline">
                        Amend it
                      </Link>
                    ) : null}
                  </p>
                </div>
              </>
            )
          }
        </ReadBlock>
      )}
    </div>
  );
}

function Fact({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" }) {
  return (
    <div className={cn("rounded-xl border bg-background/40 p-4", tone === "bad" && "border-breaks/40 bg-breaks/10", tone === "good" && "border-keeps/40 bg-keeps/10")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

/** The public record: what the register pages found about this member. */
function Record({ desk, m }: { desk: Desk; m: Member }) {
  const missing = BigInt(desk.memberStakeAtto) - BigInt(m.stakeAtto);
  return (
    <section className={card} aria-labelledby="record-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="record-title" className="text-2xl font-semibold">
            {m.publicName || "No public name"}
            <SectionHelp k="member-record" />
          </h2>
          <p className="text-xs text-muted-foreground">
            Member {m.number} of {desk.label} · <Address value={m.who} className="text-xs" />
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            m.retired ? "border-border text-muted-foreground" : m.stakeWhole ? "border-keeps/40 bg-keeps/10 text-keeps" : "border-gold/40 bg-gold/10 text-gold",
          )}
        >
          {m.retired ? "Retired" : m.stakeWhole ? "May countersign" : "Stake not whole"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact
          label="Stake"
          value={gen(m.stakeAtto)}
          note={missing > 0n ? `${gen(missing)} short of the ${gen(desk.memberStakeAtto)} this desk asks.` : `The ${gen(desk.memberStakeAtto)} this desk asks of every member.`}
          tone={missing > 0n ? "bad" : undefined}
        />
        <Fact label="Signatures it answers for" value={String(m.signedOpen)} note={`Counted on spends not yet ended; ${m.holdsOpen} of them in a hold of ${minutesLabel(desk.holdMinutes)}.`} />
        <Fact label="Hidden conflicts proven" value={String(m.hidden)} note="Signatures a register page struck, each costing the whole stake." tone={m.hidden ? "bad" : undefined} />
        <Fact label="Challenges survived" value={String(m.cleared)} note="Pages that named this member and showed nothing hidden; each paid them the challenger's bond." tone={m.cleared ? "good" : undefined} />
        <Fact label="Spends posted, still open" value={String(m.openPosted)} note="A member may hold two open at once." />
        <Fact label="Disclosure" value={`version ${m.version}`} note={`Read against spends posted after sequence number ${m.filedSeq}.`} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        That a name on a register page is this member is the register&apos;s claim, matched against the public name above, which the member
        gave. The fund checks no identity.
      </p>
    </section>
  );
}

/** Restake, retire and withdraw: what only the member may do to their own stake. */
function YourStake({ desk, m, onChanged }: { desk: Desk; m: Member; onChanged: () => void }) {
  const me = useMe();
  const [sure, setSure] = React.useState(false);
  const tx = useTx(() => onChanged());
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const missing = BigInt(desk.memberStakeAtto) - BigInt(m.stakeAtto);
  const done = tx.final && succeeded(tx.final) ? tx.call?.fn : null;
  const free = m.signedOpen === 0 && m.holdsOpen === 0;

  return (
    <section className={cn(card, "space-y-4 text-sm")} aria-labelledby="stake-title">
      <h2 id="stake-title" className="flex items-center gap-2 text-lg font-semibold">
        <PiggyBank className="size-4 text-primary" /> Your stake
        <SectionHelp k="member-stake" />
      </h2>
      {!m.retired && missing > 0n ? (
        <>
          <WaitPanel
            tone="warn"
            title="A register page struck a signature of yours, and your stake is not whole."
            lines={waitingCopy({ kind: "restake", desk: desk.id, publicName: m.publicName, missingAtto: missing.toString(), holdsOpen: m.holdsOpen }, "signer")}
          />
          <WalletGate action="restake">
            <Button
              type="button"
              variant="cool"
              disabled={busy || me.balanceAtto < missing}
              onClick={() => void tx.start(calls.restake(desk.id, missing))}
            >
              <RotateCcw /> Restake {gen(missing)}
            </Button>
          </WalletGate>
          {me.balanceAtto < missing ? <p className="text-xs text-gold">Your wallet holds {gen(me.balanceAtto)}. The wallet menu gets 10 test GEN from the faucet.</p> : null}
          <p className="text-xs text-muted-foreground">Exactly the amount missing; any other amount is refused and returned in the same transaction.</p>
        </>
      ) : null}
      {m.retired ? (
        <>
          <WaitPanel
            tone={free ? "good" : "plain"}
            lines={waitingCopy({ kind: "retired", desk: desk.id, stakeAtto: m.stakeAtto, signedOpen: m.signedOpen, holdsOpen: m.holdsOpen }, "signer")}
          />
          {BigInt(m.stakeAtto) > 0n ? (
            <WalletGate action="take your stake back">
              <Button type="button" variant="cool" disabled={busy || !free} onClick={() => void tx.start(calls.withdrawStake(desk.id))}>
                <Undo2 /> Withdraw my stake of {gen(m.stakeAtto)}
              </Button>
            </WalletGate>
          ) : (
            <p className="flex items-center gap-1.5 text-keeps">
              <BadgeCheck className="size-4" /> Your stake has been taken back. Nothing of yours is held on {desk.id}.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2 rounded-xl border bg-background/40 p-4">
          <p className="font-medium">Leave the desk</p>
          <p className="text-muted-foreground">
            Retiring stops you countersigning on {desk.id}, for good. Your readings already counted still count, and the stake stays where a
            register page can reach it until every spend you signed is paid, expires or has your signature struck; then you take it back
            here. {m.signedOpen ? `Right now it answers for ${m.signedOpen} ${m.signedOpen === 1 ? "signature" : "signatures"}.` : "Right now it answers for nothing, so it can come back at once."}
          </p>
          {!sure ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setSure(true)}>
              <LogOut /> Retire from countersigning
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-xs text-gold">
                <ShieldAlert className="size-3.5" /> This is for good on {desk.id}.
              </p>
              <WalletGate action="retire">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setSure(false);
                    void tx.start(calls.retire(desk.id));
                  }}
                >
                  Retire for good
                </Button>
              </WalletGate>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSure(false)}>
                Stay
              </Button>
            </div>
          )}
        </div>
      )}
      <TxBlock tx={tx} label={tx.call?.fn === "restake" ? "Restaking" : tx.call?.fn === "retire" ? "Retiring" : "Withdrawing your stake"} />
      {done === "restake" ? <p className="text-keeps">Restaked. Your stake is whole and you may countersign again.</p> : null}
      {done === "retire" ? <p className="text-keeps">Retired. Your stake comes back once nothing you signed is open or in a hold.</p> : null}
      {done === "withdraw_stake" ? <p className="text-keeps">Your stake is on its way back to your wallet; it lands a few seconds after finality.</p> : null}
    </section>
  );
}

/** Bond credit is per address, not per desk: what a challenge is bonded from. */
function BondCredit({ who, own }: { who: string; own: boolean }) {
  const credit = useRead(() => readBondCredit(who), [who]);
  const tx = useTx(() => void credit.refresh());
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const held = BigInt(credit.data?.creditAtto ?? "0");
  return (
    <section className={cn(card, "space-y-2 text-sm")} aria-labelledby="bond-title">
      <h2 id="bond-title" className="text-lg font-semibold">
        Bond credit
      </h2>
      {credit.error && !credit.data ? <ReadError onRetry={credit.retry} detail={credit.error} compact /> : null}
      <p className="text-muted-foreground">
        {credit.data
          ? `${own ? "You hold" : "This address holds"} ${gen(held)} of bond credit, enough for ${credit.data.covered} ${credit.data.covered === 1 ? "challenge" : "challenges"} of ${gen(credit.data.bondAtto)} each. It is not tied to any desk; a challenge that reads clean pays its bond to the member it named, and nothing else takes it.`
          : "Reading the bond credit."}
      </p>
      {own && held > 0n ? (
        <WalletGate action="withdraw your bond credit">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void tx.start(calls.withdraw())}>
            <Undo2 /> Withdraw all {gen(held)}
          </Button>
        </WalletGate>
      ) : null}
      <TxBlock tx={tx} label="Withdrawing your bond credit" />
    </section>
  );
}
