"use client";

// File a disclosure (enrol), or amend the one on file. The page says before any signature what
// the contract will do with it: stamp it with the next sequence number, publish it, and read it
// only against spends posted after that number.

import { SectionHelp } from "@/components/section-help";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, FilePenLine, FileSignature } from "lucide-react";

import { DisclosureForm, EMPTY_DISCLOSURE, disclosureProblem, type Disclosure } from "@/components/disclosure-form";
import { BlockSkeleton, ReadBlock, ReadError } from "@/components/read-state";
import { TxBlock } from "@/components/tx-block";
import { Button } from "@/components/ui/button";
import { useDeskId } from "@/components/use-desk";
import { useMe } from "@/components/use-me";
import { useRead } from "@/components/use-read";
import { succeeded, useTx } from "@/components/use-tx";
import { WalletGate } from "@/components/wallet-gate";
import { LIMITS, calls, filedDisclosure, readDesk, readLimits, readMember, type Desk, type Limits, type Member } from "@/lib/chain";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";

const sameDisclosure = (d: Disclosure, m: Member) => {
  const norm = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  const a = d.addresses.map((x) => x.trim().toLowerCase()).filter(Boolean);
  return (
    norm(d.statement) === norm(m.statement) &&
    d.entries.length === m.entries.length &&
    d.entries.every((e, i) => norm(e.name) === norm(m.entries[i].name) && e.relation === m.entries[i].relation && norm(e.detail) === norm(m.entries[i].detail)) &&
    a.length === m.declared.length &&
    a.every((x, i) => x === m.declared[i])
  );
};

export default function EnrolPage() {
  const deskId = useDeskId();
  const me = useMe();
  const desk = useRead(() => readDesk(deskId), [deskId]);
  const member = useRead(() => readMember(deskId, me.address), [deskId, me.address], { enabled: !!me.address && !!desk.data });
  const limitsRead = useRead(() => readLimits(), [], { enabled: !!desk.data });
  const limits = limitsRead.data ?? LIMITS;
  // The enrolment this browser just filed, kept here so its result stays on screen once the
  // member row exists and the form gives way to the disclosure on file.
  const [filedNow, setFiledNow] = React.useState<{ member: string; filedSeq: number; who: string } | null>(null);
  const justFiled = filedNow && filedNow.who === me.address ? filedNow : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Enrol</h1>
        <p className="text-muted-foreground">
          You join a desk by filing a disclosure of your own interests. Nobody admits you and nobody checks it: the contract
          stores what you file, stamps it with a sequence number, and reads it whenever you countersign a spend posted after
          that number.
        </p>
      </div>

      <ReadBlock
        state={desk}
        skeleton={<BlockSkeleton lines={4} />}
        empty={
          <div className={cn(card, "space-y-3")}>
            <p className="font-medium">This register has no desk {deskId} yet.</p>
            <p className="text-sm text-muted-foreground">A desk has to exist before anyone can enrol on it. Opening one takes one transaction.</p>
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
                {d.members} of {limits.membersPerDesk} members ·{" "}
                {d.openEnrolment ? "open enrolment: anyone may file" : `fixed roster of ${d.roster.length}: only those addresses may file`} ·{" "}
                <Link href="/desk" className="text-primary underline-offset-4 hover:underline">
                  change desk
                </Link>
              </p>
            </div>

            <WalletGate action="file a disclosure">
              {member.loading && !member.data ? (
                <BlockSkeleton lines={5} />
              ) : member.error && !member.data ? (
                <ReadError onRetry={member.retry} detail={member.error} />
              ) : member.data ? (
                <>
                  {justFiled ? <Enrolled desk={d} member={justFiled.member} filedSeq={justFiled.filedSeq} /> : null}
                  <Amend
                    desk={d}
                    member={member.data}
                    limits={limits}
                    onFiled={() => {
                      void member.refresh();
                      void desk.refresh();
                    }}
                  />
                </>
              ) : (
                <Enrol
                  desk={d}
                  me={me.address}
                  limits={limits}
                  onFiled={(f) => {
                    if (f) setFiledNow({ ...f, who: me.address });
                    void member.refresh();
                    void desk.refresh();
                  }}
                />
              )}
            </WalletGate>
          </>
        )}
      </ReadBlock>
    </div>
  );
}

function WhatHappens({ amend }: { amend?: boolean }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
      <p className="font-medium">What happens when you sign</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          The contract stores your disclosure under your address and gives it the next number of its own counter. One
          transaction, usually under a minute.
        </li>
        <li>It is public. Everyone can read it on the desk page, and it is quoted to the validators whenever you countersign.</li>
        {amend ? (
          <li className="text-foreground">
            An amendment only counts for spends posted after it. Your new sequence number is above every spend that already
            exists, so on every one of those a countersignature from you will be refused as filed too late, and so will one
            on a later spend to a payee that was already posted and has not been paid since. The version it replaces stays in
            the contract&apos;s history.
          </li>
        ) : (
          <li>
            It is read only against spends posted after it. On a spend that already exists, a countersignature from you is
            refused as filed too late. That is the rule working: nobody may write a disclosure after seeing the spend they
            want to approve. To be read by the validators without waiting for a new spend here, use the{" "}
            <Link href="/practice" className="text-primary underline-offset-4 hover:underline">
              practice desk
            </Link>
            , which posts one after your disclosure.
          </li>
        )}
        <li>The contract cannot check that it is true or complete. It reads what you file and cannot know what you leave out.</li>
      </ul>
    </div>
  );
}

/** What enrolling just did, and what comes next. */
function Enrolled({ desk, member, filedSeq }: { desk: Desk; member: string; filedSeq: number }) {
  return (
    <div className="rounded-2xl border border-keeps/40 bg-keeps/10 p-5 text-sm">
      <p className="font-medium">
        Filed. You are member {member} of {desk.label}, at sequence number {filedSeq}.
      </p>
      <p className="mt-1 text-muted-foreground">
        Next: countersign a spend. Any spend posted from now on is read against this disclosure; a spend that already existed
        will refuse you as filed too late. That refusal is the rule working, and it is itself a recorded outcome. The guide on
        the home page names the spend to open. If you are here alone, the practice desk shows the whole thing, a judged
        reading and a payment, without anybody else.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/practice">Open the practice desk</Link>
        </Button>
        <Button asChild variant="cool" size="sm">
          <Link href="/">
            Back to the guide <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/desk">See the desk&apos;s spends</Link>
        </Button>
      </div>
    </div>
  );
}

function Enrol({ desk, me, limits, onFiled }: { desk: Desk; me: string; limits: Limits; onFiled: (filed: { member: string; filedSeq: number } | null) => void }) {
  const [value, setValue] = React.useState<Disclosure>(EMPTY_DISCLOSURE);
  const [error, setError] = React.useState("");
  const tx = useTx((s) => onFiled(succeeded(s) ? filedDisclosure(s) : null));
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const filed = tx.final && succeeded(tx.final) ? filedDisclosure(tx.final) : null;

  const offRoster = !desk.openEnrolment && !!me && !desk.roster.includes(me);
  const full = desk.openEnrolment && desk.members >= limits.membersPerDesk;

  if (offRoster)
    return (
      <div className={cn(card, "space-y-3 text-sm")}>
        <p className="font-medium">Your address is not on this desk&apos;s roster.</p>
        <p className="text-muted-foreground">
          Desk {desk.id} was opened with a fixed roster of {desk.roster.length} addresses, and nobody can change it, not even
          its opener. You can enrol on a desk with open enrolment, or open a desk of your own; neither needs anyone&apos;s
          permission.
        </p>
        <Button asChild variant="cool" size="sm">
          <Link href="/desk">
            Choose or open another desk <ArrowRight />
          </Link>
        </Button>
      </div>
    );
  if (full)
    return (
      <div className={cn(card, "space-y-3 text-sm")}>
        <p className="font-medium">This desk holds the most members a desk takes ({limits.membersPerDesk}).</p>
        <p className="text-muted-foreground">Open a desk of your own; it takes one transaction and nobody&apos;s permission.</p>
        <Button asChild variant="cool" size="sm">
          <Link href="/desk">
            Open a desk <ArrowRight />
          </Link>
        </Button>
      </div>
    );

  const submit = () => {
    const p = disclosureProblem(value, limits);
    setError(p);
    if (p) return;
    void tx.start(calls.enrol(desk.id, value.statement, value.entries, value.addresses));
  };

  return (
    <section className={cn(card, "space-y-5")} aria-labelledby="enrol-title">
      <h2 id="enrol-title" className="flex items-center gap-2 text-lg font-semibold">
        <FileSignature className="size-4 text-primary" /> Your disclosure
        <SectionHelp k="enrol-file" />
      </h2>
      <DisclosureForm value={value} onChange={setValue} limits={limits} disabled={busy || !!filed} />
      <WhatHappens />
      {error ? (
        <p role="alert" className="text-sm text-gold">
          {error}
        </p>
      ) : null}
      {!filed ? (
        <Button type="button" variant="cool" size="lg" disabled={busy || !me} onClick={submit}>
          <FileSignature /> File it and enrol
        </Button>
      ) : null}
      <TxBlock tx={tx} label={`Filing your disclosure on ${desk.id}`} />
    </section>
  );
}

const onFile = (m: Member): Disclosure => ({
  statement: m.statement,
  entries: m.entries.map((e) => ({ name: e.name, relation: e.relation, detail: e.detail })),
  addresses: m.declared.slice(),
});

function Amend({ desk, member, limits, onFiled }: { desk: Desk; member: Member; limits: Limits; onFiled: () => void }) {
  const [value, setValue] = React.useState<Disclosure>(() => onFile(member));
  const [editing, setEditing] = React.useState(false);
  const [understood, setUnderstood] = React.useState(false);
  const [error, setError] = React.useState("");
  const tx = useTx((s) => {
    if (succeeded(s)) {
      setEditing(false);
      setUnderstood(false);
    }
    onFiled();
  });
  const busy = tx.sending || (!!tx.hash && !tx.final);
  const unchanged = sameDisclosure(value, member);
  const amended = tx.final && succeeded(tx.final) ? filedDisclosure(tx.final) : null;

  const submit = () => {
    const p = disclosureProblem(value, limits);
    setError(p);
    if (p) return;
    void tx.start(calls.amend(desk.id, value.statement, value.entries, value.addresses));
  };

  return (
    <section className={cn(card, "space-y-5")} aria-labelledby="amend-title">
      <div className="space-y-2">
        <h2 id="amend-title" className="flex items-center gap-2 text-lg font-semibold">
          <FilePenLine className="size-4 text-primary" /> Your disclosure on file
        <SectionHelp k="enrol-amend" />
      </h2>
        <p className="text-sm text-muted-foreground">
          You are member <strong className="text-foreground">{member.number}</strong> of {desk.label}. Version {member.version},
          filed at sequence number {member.filedSeq}; the counter now stands at {desk.seqNow}. It is read against every spend
          posted at a higher number than {member.filedSeq}.
        </p>
      </div>
      {!editing ? (
        <>
          <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-foreground/90">{member.statement}</blockquote>
          <ul className="space-y-1.5">
            {member.entries.map((e, i) => (
              <li key={i} className="rounded-lg border bg-background/40 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">{e.name}</span>
                <span className="text-muted-foreground">: {e.relationPhrase}.</span>
                {e.detail ? <span className="text-foreground/80"> {e.detail}</span> : null}
              </li>
            ))}
          </ul>
          <p className="break-hash text-xs text-muted-foreground">
            {member.declared.length ? `Declared addresses: ${member.declared.join(", ")}` : "No declared addresses beyond the one you enrolled from."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="cool" size="sm">
              <Link href="/desk">
                See the desk&apos;s spends <ArrowRight />
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setValue(onFile(member));
                setEditing(true);
              }}
            >
              <FilePenLine /> Amend it
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Amend when your interests change. An amendment only counts for spends posted after it: it costs you your say on
            every spend that already exists.
          </p>
        </>
      ) : (
        <>
          <DisclosureForm value={value} onChange={setValue} limits={limits} disabled={busy} />
          <WhatHappens amend />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 size-4 accent-[var(--primary)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={busy} />
            <span>I understand that this amendment is read against later spends only, and that I lose my say on every spend already posted.</span>
          </label>
          {unchanged ? (
            <p className="text-sm text-muted-foreground">
              Nothing differs from what is on file. The contract refuses an amendment that says what the disclosure already
              says, because it would only move your sequence number.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-gold">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="cool" disabled={busy || unchanged || !understood} onClick={submit}>
              <FilePenLine /> File the amendment
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">One transaction, usually under a minute. When it is final this page shows the new version.</p>
        </>
      )}
      <TxBlock tx={tx} label="Filing your amendment" />
      {amended ? (
        <div className="rounded-xl border border-keeps/40 bg-keeps/10 p-4 text-sm">
          <p className="font-medium">
            Amended. Version {amended.version} is on file at sequence number {amended.filedSeq}.
          </p>
          <p className="mt-1 text-muted-foreground">
            It is read against spends posted from now on. On every spend that already existed, a countersignature from you
            will be refused as filed too late. Nothing else is needed from you.
          </p>
        </div>
      ) : null}
    </section>
  );
}
