"use client";

// The box a first-time visitor sees: what the site is, what it checks, the words it uses, and
// where to start. It opens once, and the "How it works" button in the header opens it again.

import * as React from "react";
import { useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { useLocal } from "@/components/use-local";
import { readItem, writeItem, notify } from "@/lib/browser-store";
import { TRACK_KEY } from "@/lib/catch";

const KEY = "recused:welcomed";

const STEPS: [string, string][] = [
  ["Members say what their interests are", "Each member files a short disclosure in advance: their work, what they own, who they are tied to."],
  ["Somebody asks the fund to pay", "A member posts a spend: who is paid, how much, and what for."],
  ["Two other members countersign", "The one who posted it may not approve it. Two others must."],
  ["The validators check each signer", "The contract asks GenLayer's validators one question two ways: does this payment change this member's position if it goes ahead, and if it does not?"],
  ["A short hold, then the money moves", "Two clear answers put the spend in a short hold; then anyone may release it and the payee is paid. A member whose interests move is recused, in public."],
  ["What a member hid, a register can prove", "During the hold anyone may cite a page of a public register the desk named. If every validator reads it as showing a relation the member hid, the signature is struck and the stake pays whoever cited it."],
];

const WORDS: [string, string][] = [
  ["Desk (D1)", "one shared fund; D1 is the first one"],
  ["Spend (S2)", "a request to pay someone; S2 is the second spend on a desk"],
  ["Member (M3)", "a person on the desk; M3 was the third to join"],
  ["Disclosure", "what a member says their own interests are"],
  ["Countersign", "to approve a spend somebody else posted"],
  ["UU / GU", "the stored result: U unaffected, G gains, L loses; first if it is paid, then if it is not"],
  ["Recused", "refused for this one spend, because your interests move; not a finding against you"],
  ["Stake", "what every member puts up to sign; a struck signature costs all of it"],
  ["Hold", "the wait between the second clear countersignature and the payment"],
  ["Challenge", "citing a register page against a counted signature, with a small bond"],
];

/** Open the welcome box again (used by the header button). */
export function openWelcome(): void {
  writeItem(KEY, null);
  notify();
}

export function WelcomeButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={openWelcome}>
      <HelpCircle /> How it works
    </Button>
  );
}

export function Welcome() {
  const router = useRouter();
  // The server and the first paint assume it was seen, so nothing flashes for a returning visitor.
  const seen = useLocal(() => readItem(KEY) === "1", true);
  const close = () => {
    writeItem(KEY, "1");
    notify();
  };
  return (
    <Dialog open={!seen} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Recused, in one minute</DialogTitle>
          <DialogDescription className="text-sm text-foreground/85">
            A shared fund with one rule: you may not approve a payment that touches your own interests. The check is made by
            GenLayer&apos;s validators, on what you said about yourself before the payment existed.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-2">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-xs font-semibold text-white">
                {i + 1}
              </span>
              <span className="min-w-0 text-xs">
                <span className="block text-sm font-medium text-foreground">{title}</span>
                <span className="block text-muted-foreground text-pretty">{body}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">The words this site uses</p>
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {WORDS.map(([word, meaning]) => (
              <div key={word} className="flex gap-2">
                <dt className="shrink-0 font-mono text-foreground">{word}</dt>
                <dd className="text-muted-foreground">{meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="rounded-xl border border-brand/40 bg-brand/10 p-3 text-xs" data-v2="welcome">
          <p className="mb-1 text-xs font-semibold tracking-wide uppercase">What is new in version 2</p>
          <p className="text-foreground/85">
            Version 1 could only read what a member filed. Now members stake to sign, a carried spend waits in a short hold, and a page of a
            public register the desk named in advance, read on the live web by every validator, can strike a signature that hid a relation
            to the payee and pay the stake to whoever cited it, in one transaction. The practice desk&apos;s second track lets you do it alone.
          </p>
          <button
            type="button"
            className="mt-2 cursor-pointer text-primary underline-offset-4 hover:underline"
            onClick={() => {
              close();
              writeItem(TRACK_KEY, "catch");
              router.push("/practice?track=catch");
            }}
          >
            Catch a hidden conflict on the practice desk
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InteractiveHoverButton
            onClick={() => {
              close();
              router.push("/practice");
            }}
          >
            Try it on the practice desk
          </InteractiveHoverButton>
          <Button type="button" variant="ghost" onClick={close}>
            Look around first
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
