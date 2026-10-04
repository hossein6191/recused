"use client";

// What each page is for, and what a visitor can do on it, step by step. One box at the top of
// every page except the landing page, open the first time and remembered once it is folded away.

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Compass } from "lucide-react";

import { useLocal } from "@/components/use-local";
import { readItem, writeItem, notify } from "@/lib/browser-store";
import { cn } from "@/lib/utils";

type Guide = { key: string; title: string; what: string; steps: [string, string][]; note?: string };

const GUIDES: { match: (path: string) => boolean; guide: Guide }[] = [
  {
    match: (p) => p.startsWith("/practice"),
    guide: {
      key: "practice",
      title: "Practice desk",
      what: "The quickest way to see everything, on your own. A spend needs three different members, so this page plays the other two for you with practice accounts kept in your browser. Every step is a real transaction.",
      steps: [
        ["Connect and get test GEN", "Press Connect wallet at the top right, then take test GEN from the faucet. It costs nothing."],
        ["Press Start", "The page opens a small fund and enrols its practice members. About a minute."],
        ["File your own disclosure", "When the page asks, say what your interests are. Pick an example to fill the form. One signature."],
        ["Wait for the notice window", "A practice member posts a spend. For about five minutes members may say who the payee is; a countdown shows when it ends."],
        ["Countersign", "Press Countersign. The validators read your disclosure against the spend and the page shows your result."],
        ["See the payment and the refusal", "A second clear approval pays the payee. Then press the contrast to watch a member with an interest be refused."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/desk"),
    guide: {
      key: "desk",
      title: "Desk",
      what: "A desk is one shared fund: its money, its members and its spends. D1 is the first desk on this register, D2 the second.",
      steps: [
        ["Pick a desk", "Use the list at the top. Each desk has its own money and its own members."],
        ["Read the balance", "Free is what a new spend may still ask for. Committed is already promised to spends that are open."],
        ["Read the members", "Every member has a disclosure of their interests and a number saying when they filed it."],
        ["Open a spend", "S1, S2, S3 are the spends in the order they were posted. Open one to read it or to countersign it."],
        ["Fund, reclaim, or open your own", "Add money with Fund, take your share back with Reclaim, or open a new desk at the bottom of the page."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/enrol"),
    guide: {
      key: "enrol",
      title: "Enrol",
      what: "Before you may countersign anything, you say what your own interests are. That statement is your disclosure, and it only counts for spends posted after you file it.",
      steps: [
        ["Start from an example", "Press one of the examples to fill the whole form, then change whatever is not true of you."],
        ["Write your statement", "A few plain sentences: your work, what you own or run, anything that might ask this fund for money."],
        ["Add your entries", "Each entry names one thing, a shop, an employer, a club, a person, and how you are related to it."],
        ["Declare addresses (optional)", "If a wallet address is yours, list it. A spend that pays it is refused to you at once."],
        ["File it", "One signature. From that moment you can countersign spends that are posted later."],
      ],
      note: "You can amend it later, but an amendment only counts for spends posted after the amendment.",
    },
  },
  {
    match: (p) => p === "/spend/new",
    guide: {
      key: "spend-new",
      title: "Post a spend",
      what: "A spend is a request to pay somebody out of the desk. It is paid only when two other members countersign it and both are read clear.",
      steps: [
        ["Start from an example", "Press an example to fill the form, or type the payee's address yourself."],
        ["Say what it is for", "Give the amount, and describe what is being bought and from whom. The validators read these words."],
        ["Set the two windows", "The notice window gives members time to say who the payee is. After it, approvals stay open for as long as you choose."],
        ["Post it", "One signature. The spend gets the next number on the desk, for example S3."],
        ["Wait for two others", "You may not approve your own spend. Two other members must countersign it."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/spend/"),
    guide: {
      key: "spend",
      title: "One spend",
      what: "Everything about a single spend. The name at the top, for example D1-S2, means the second spend posted on desk one.",
      steps: [
        ["Read the status", "It says which window is running, how long is left, and how many approvals the spend has."],
        ["Read the document", "This is the exact text the validators read. The contract wrote it from the facts it holds."],
        ["Identify the payee", "During the notice window a member may add one sentence saying who the payee really is."],
        ["Countersign", "After the notice window, press Countersign. Your disclosure is read against the spend twice: if it is carried out, and if it is not."],
        ["Read the result", "UU means nothing of yours moves: clear, and it counts. A pair such as GU means you gain or lose, so you are recused. The second clear approval pays the payee in that transaction."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/ledger"),
    guide: {
      key: "ledger",
      title: "Ledger",
      what: "The public record of a desk. Nothing here needs a wallet.",
      steps: [
        ["Pick a desk", "The ledger shows one desk at a time."],
        ["Read the spends", "Each one is open, paid or expired, with its amount and payee."],
        ["Read the readings", "Under a spend: who countersigned, the stored pair, and the sentence the contract wrote about it."],
        ["Filter the recusals", "Show only the approvals that were refused because an interest moved."],
        ["Read the refusals", "At the bottom are the calls the contract turned away on a rule alone, with no model asked."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/deploy"),
    guide: {
      key: "deploy",
      title: "Deploy",
      what: "Run a register of your own from the same source. Most visitors never need this page.",
      steps: [
        ["Check the source", "The page shows the contract file and its fingerprint, so you know what you are deploying."],
        ["Deploy", "One signature. It takes about a minute, and a minute more before the network answers reads."],
        ["Use it", "Your browser then reads your own register. A button brings you back to the site's own."],
      ],
    },
  },
];

export function PageGuide() {
  const pathname = usePathname() || "/";
  const found = GUIDES.find((g) => g.match(pathname));
  const storeKey = found ? `recused:guide:${found.guide.key}` : "";
  const closed = useLocal(() => (storeKey ? readItem(storeKey) === "closed" : false), false);
  if (!found) return null;
  const g = found.guide;
  const toggle = () => {
    writeItem(storeKey, closed ? null : "closed");
    notify();
  };
  return (
    <div className="container-site pt-6">
      <section aria-label={`What the ${g.title} page is for`} className="rounded-2xl border border-brand/30 bg-brand/[0.07] backdrop-blur-sm">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!closed}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-white">
            <Compass className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">What this page is for, step by step</span>
            <span className="block truncate text-xs text-muted-foreground">{closed ? "Press to open the guide for this page" : g.title}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", closed ? "" : "rotate-180")} />
        </button>
        {closed ? null : (
          <div className="space-y-4 px-4 pb-4">
            <p className="text-sm text-foreground/90 text-pretty">{g.what}</p>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.steps.map(([title, body], i) => (
                <li key={title} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/25 text-xs font-semibold text-foreground">{i + 1}</span>
                  <span className="min-w-0 text-xs">
                    <span className="block font-medium text-foreground">{title}</span>
                    <span className="block text-muted-foreground text-pretty">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            {g.note ? <p className="text-xs text-muted-foreground">{g.note}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
