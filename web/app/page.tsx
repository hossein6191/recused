import Link from "next/link";
import { ArrowRight, BookOpenText } from "lucide-react";

import { Guide } from "@/components/guide";
import { TokenPair, VerdictBadge } from "@/components/reading";
import { Button } from "@/components/ui/button";
import { HeroCta } from "@/components/hero-cta";
import { Terminal, type TerminalLine } from "@/components/ui/terminal";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border bg-card p-5 sm:p-6";

const FIVE: [string, string][] = [
  ["Say what your interests are", "Each member files a short disclosure in advance: their work, what they own, who they are tied to."],
  ["Someone asks the fund to pay", "A member posts a spend: who is paid, how much and what for."],
  ["Two others countersign", "The poster may not approve their own spend. Two other members must."],
  ["The validators check each signer", "Does this payment move this member's position if it is paid? And if it is not?"],
  ["Paid, or recused", "Two clear answers pay the payee at once. A member whose interests move is refused, in public."],
];

const READING: TerminalLine[] = [
  { text: "> approve(D1, S1)   signed by the member who part owns the print shop", tone: "cmd", typed: true },
  { text: "  spend S1: 180 GEN to the print shop, for 500 copies of the annual report", tone: "dim" },
  { text: "  filed before the spend: 'I own half of Pelican Press with my sister'", tone: "dim" },
  { text: "  if the spend is carried out ......... the member GAINS", tone: "warn" },
  { text: "  if it is not carried out ............ UNAFFECTED", tone: "dim" },
  { text: "  stored value GU   3 validators agree", tone: "warn" },
  { text: "x interested: recused, the refusal is published, no money moves", tone: "bad" },
  { text: "> approve(D1, S1)   signed by the teacher", tone: "cmd", typed: true },
  { text: "  stored value UU   3 validators agree", tone: "ok" },
  { text: "+ clear: counted 2 of 2", tone: "ok" },
  { text: "+ 180 GEN paid to the print shop in this transaction", tone: "ok" },
];

export default function HomePage() {
  return (
    <div className="container-site space-y-10 py-8 sm:py-12">
      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-5">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">A shared fund on GenLayer</p>
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            You may not approve a payment <span className="text-gradient">that touches your own interests.</span>
          </h1>
          <p className="max-w-xl text-base text-foreground/85 sm:text-lg">
            Recused is a fund several people share. A payment leaves it only when two members approve, and GenLayer&apos;s
            validators check each approver against what that person said about themselves beforehand.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <HeroCta />
            <Button asChild variant="outline" size="lg">
              <Link href="/ledger">
                <BookOpenText /> See what already happened
              </Link>
            </Button>
          </div>
        </div>
        <Terminal title="one countersignature, as the contract reads it" lines={READING} />
      </section>

      <section aria-labelledby="steps-title" className="space-y-4">
        <h2 id="steps-title" className="text-xl font-semibold tracking-tight">
          How it works, in five steps
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FIVE.map(([title, body], i) => (
            <li key={title} className={cn(card, "space-y-2 p-4 sm:p-4")}>
              <span className="flex size-8 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-sm font-semibold text-white">
                {i + 1}
              </span>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground text-pretty">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        <Guide />
        <div className="space-y-4">
          <div className={cn(card, "space-y-2")}>
            <p className="text-sm font-semibold">What exactly is checked</p>
            <ul className="space-y-2 text-sm text-foreground/85">
              <li>Whether the payment changes the approver&apos;s own position if it goes ahead.</li>
              <li>Whether it changes their position if it does not go ahead.</li>
              <li>Three things with no model at all: you posted the spend yourself, the payee is an address you declared as yours, or your disclosure is newer than the spend.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-sm">
            <p className="font-semibold text-gold">The limit, said plainly</p>
            <p className="mt-1 text-foreground/85">
              The contract reads what you filed and cannot know what you hid. A member who leaves something out reads clear,
              and so does one who files a false statement. A desk with open enrolment is not safe for money that matters:
              three addresses one person controls can post a spend and carry it. A desk holding real money names its
              members when it is opened.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="How it works">
        <div className={card}>
          <h2 className="text-lg font-semibold">The two-branch question</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A conflict of interest does not only run one way. A member may gain if the spend goes through, or gain if it
            fails. So each countersignature is read twice, and the validators must agree on two characters, one per branch.
          </p>
          <div className="mt-4 space-y-3">
            <div className="space-y-2">
              <VerdictBadge verdict="clear" />
              <TokenPair value="UU" />
            </div>
            <div className="space-y-2">
              <VerdictBadge verdict="interested" />
              <TokenPair value="GU" />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Only <code className="font-mono text-foreground">UU</code> is clear. The question is asked in two presentation
            orders, and an unstable, vague or unreadable answer has its own character and is never rounded to clear.
          </p>
        </div>

        <div className={card}>
          <h2 className="text-lg font-semibold">What a recusal is, and is not</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A recusal says that something you filed yourself moves with this decision. It is your own disclosure doing its
            job, in public, on one spend.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-foreground/85">
            <li>It is not a finding against anybody. A member who discloses broadly and honestly will be recused often.</li>
            <li>
              It is not a penalty or a score. Nothing is carried to another payee: a spend to somebody else is read fresh, and
              so is the same payee once a spend to it has been paid.
            </li>
            <li>It does not stop the spend. Two other members can still carry it.</li>
            <li>It is final for that member on that spend: one attempt each, so no reading can be retried until it suits.</li>
          </ul>
        </div>

        <div className={card}>
          <h2 className="text-lg font-semibold">Three refusals that ask no model</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The defences that matter most are plain bookkeeping, so no wording can argue past them, and posting the same
            payment again under a new number escapes none of them.
          </p>
          <div className="mt-3 space-y-3 text-sm">
            <div className="space-y-1">
              <VerdictBadge verdict="late" />
              <p className="text-foreground/85">
                Every disclosure and every spend takes the next number of one counter. A disclosure written or amended after
                a spend was posted is never read against that spend, nor against a later spend to the same payee until one is
                paid. A newcomer meets this first: it is the rule working, and the practice desk is the way past it.
              </p>
            </div>
            <div className="space-y-1">
              <VerdictBadge verdict="declared" />
              <p className="text-foreground/85">
                A payee that is your own address, or one you declared as yours, is refused to you on the spot.
              </p>
            </div>
            <div className="space-y-1">
              <VerdictBadge verdict="standing" />
              <p className="text-foreground/85">
                A reading that was not clear stands for every later spend to the same payee until one is paid. Nobody is read
                twice on the same question.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="life-title">
        <h2 id="life-title" className="text-lg font-semibold">
          The life of a spend
        </h2>
        <ol className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Posted", "A member names a payee, an amount and a description. The amount is set aside in the fund so no two open spends count on the same money. Under a minute."],
            ["Notice window", "For at least five minutes nobody may countersign. Any member but the poster whose disclosure predates the spend may add one sentence saying who the payee is."],
            ["Countersignatures", "The document is sealed. Any member but the poster may countersign once. Each reading takes one to two minutes and is stored whatever it says."],
            ["Paid, or expired", "The second clear reading pays the payee in its own transaction. A spend that cannot find two before its window ends expires, and the money stays in the fund."],
          ].map(([title, text], i) => (
            <li key={title} className="rounded-xl border bg-background/40 p-4">
              <p className="text-xs font-semibold text-primary">Step {i + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link href="/practice" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            See all four steps alone on the practice desk <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/enrol" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            File a disclosure <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/spend/new" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            Post a spend <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/deploy" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            Deploy your own copy <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
