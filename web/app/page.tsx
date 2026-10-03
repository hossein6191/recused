import Link from "next/link";
import { ArrowRight, BookOpenText, FlaskConical, Landmark } from "lucide-react";

import { Guide } from "@/components/guide";
import { TokenPair, VerdictBadge } from "@/components/reading";
import { Button } from "@/components/ui/button";

const card = "rounded-2xl border bg-card p-5 sm:p-6";

export default function HomePage() {
  return (
    <div className="container-site space-y-10 py-8 sm:py-12">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-5">
          <p className="text-xs font-semibold tracking-widest text-primary uppercase">A shared fund on GenLayer</p>
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            Two countersignatures, and <span className="text-gradient">none from anyone the spend would move.</span>
          </h1>
          <p className="max-w-2xl text-base text-foreground/85 sm:text-lg">
            Recused is a shared fund. A spend is paid only after two members other than its poster countersign it. Every
            member files their own interests in advance. When a member countersigns, the contract asks the validators one
            question under both branches of the pending decision: what happens to what this member filed if the spend is
            carried out, and what happens if it is not. If either answer moves, the member is refused and the recusal is
            published. Two clear countersignatures send the money to the payee in that same transaction.
          </p>
          <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
            <p className="font-semibold text-gold">The limit, before anything else</p>
            <p className="mt-1 text-foreground/85">
              The contract reads what you filed and cannot know what you hid. A member who leaves something out reads clear,
              and so does one who files a false statement. A desk with open enrolment is not safe for money that matters:
              three addresses one person controls can post a spend and carry it. A desk holding real money names its
              members when it is opened.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="cool" size="lg">
              <Link href="/practice">
                <FlaskConical /> Try it alone: the practice desk
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/desk">
                <Landmark /> Open the desk
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/ledger">
                <BookOpenText /> Read the ledger
              </Link>
            </Button>
          </div>
        </div>
        <Guide />
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
