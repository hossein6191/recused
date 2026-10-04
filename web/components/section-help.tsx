"use client";

// A small "steps" button beside the title of each part of a page. Pressing it opens what that
// part is for and what you can do in it, one numbered step at a time.

import * as React from "react";
import { ListOrdered } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Help = { title: string; what: string; steps: string[] };

const HELP: Record<string, Help> = {
  "desk-balance": {
    title: "The desk and its money",
    what: "The name of this fund and how much is in it.",
    steps: [
      "Pot is everything the desk holds right now.",
      "Committed is money already promised to spends that are still open.",
      "Free is what a new spend may ask for: the pot minus what is committed.",
      "The minimum notice is fixed for this desk: no spend may give members less time to say who a payee is.",
    ],
  },
  "desk-you": {
    title: "You and this desk",
    what: "Your own standing on this desk: whether you are a member, and what you put in.",
    steps: [
      "If you are not a member yet, press Enrol and file your disclosure.",
      "To add money, type an amount and press Fund. Anyone may fund a desk.",
      "To take your share back, press Reclaim. It pays your part of the money that is not committed to an open spend.",
      "If a spend was open when you left, your part of it comes back when that spend expires.",
    ],
  },
  "desk-spends": {
    title: "Spends on this desk",
    what: "Every payment anyone has asked this desk to make, newest first.",
    steps: [
      "Each row is one spend: S1 was the first one posted, S2 the second.",
      "Open means it is still waiting for countersignatures; Paid means two clear approvals carried it; Expired means its time ran out.",
      "Press a row to open the spend, read it, and countersign it if you may.",
      "To ask for a payment yourself, press Post a spend.",
    ],
  },
  "desk-members": {
    title: "Members",
    what: "Everyone who has filed a disclosure on this desk.",
    steps: [
      "M1 was the first to join, M2 the second.",
      "The number beside a member is when their disclosure was filed. It must be older than a spend for them to countersign it.",
      "Press a member to read what they said their interests are.",
      "A higher version means they amended their disclosure later.",
    ],
  },
  "desk-open": {
    title: "Open a desk of your own",
    what: "Start a new fund with you as its first funder.",
    steps: [
      "Give it a name, or pick one of the suggestions.",
      "Leave the roster empty to let anyone enrol, or list the addresses that may join. It can never be changed.",
      "Choose the minimum notice every spend must give, and the first amount to put in.",
      "Press Open and sign once. The new desk gets the next number.",
    ],
  },
  "enrol-file": {
    title: "Your disclosure",
    what: "The form where you say what your own interests are.",
    steps: [
      "Press an example to fill everything, then change what is not true of you.",
      "Write the statement, add at least one entry, and list any addresses that are yours.",
      "Press File and sign once.",
      "You can countersign spends that are posted after this moment, never earlier ones.",
    ],
  },
  "enrol-amend": {
    title: "Amend your disclosure",
    what: "Change what you said, when your circumstances change.",
    steps: [
      "Edit the statement, the entries or the addresses.",
      "Tick the box that says you understand the cost.",
      "Press Amend and sign once.",
      "The amendment counts only for spends posted after it. For spends already posted you are now late and cannot countersign them.",
    ],
  },
  "form-statement": {
    title: "Your statement",
    what: "A few plain sentences about you, in your own words.",
    steps: [
      "Say what you do for a living.",
      "Say what you own or help run.",
      "Say anything of yours that might ask this fund for money.",
      "Or press one of the suggestions under the box and edit it.",
    ],
  },
  "form-entries": {
    title: "Entries",
    what: "A list of the things you are tied to. The validators read a spend against each one.",
    steps: [
      "Name one thing per entry: a shop, an employer, a club, a person.",
      "Pick how you are related to it from the list.",
      "Add a few words of detail if it helps.",
      "Press a suggestion to fill an entry, or Add an entry for another one. One to six entries.",
    ],
  },
  "form-addresses": {
    title: "Declared addresses",
    what: "Wallet addresses that are yours, other than the one you are signing with.",
    steps: [
      "Press Declare an address and paste it.",
      "A spend that pays an address you declared is refused to you at once, with no model asked.",
      "This part is optional. Leave it empty if you have no other address.",
    ],
  },
  "spendnew-form": {
    title: "The spend",
    what: "The request to pay someone out of the desk.",
    steps: [
      "Press an example to fill the form, or type the payee's address.",
      "Enter the amount, then describe what is bought and from whom.",
      "Set the notice window and how long approvals stay open.",
      "Press Post and sign once. Two other members must then countersign it.",
    ],
  },
  "spend-document": {
    title: "The document",
    what: "The exact text the validators read for this spend. The contract wrote it from facts it holds, so nobody can dress it up.",
    steps: [
      "Read the payee, the amount and the description.",
      "Read what members said about who the payee is.",
      "The fingerprint under it proves every countersigner was read against the same text.",
    ],
  },
  "spend-idents": {
    title: "Who the payee is",
    what: "During the notice window, members may each add one sentence saying who the payee really is.",
    steps: [
      "If you know who the address belongs to, write one sentence or press a suggestion.",
      "Press Identify and sign once.",
      "Only four sentences fit. A fifth member is turned away, and the document says so.",
      "The member who posted the spend may not identify their own payee.",
    ],
  },
  "spend-sign": {
    title: "Countersign",
    what: "Approve this spend, and be read against it.",
    steps: [
      "Wait until the notice window has ended.",
      "Press Countersign and sign once. It takes one to two minutes.",
      "The validators ask whether the payment changes your position if it is carried out, and if it is not.",
      "UU counts as an approval. A pair showing a gain or a loss means you are recused. You get one try per spend.",
    ],
  },
  "spend-readings": {
    title: "Readings",
    what: "Every member who tried to countersign this spend, and what was stored.",
    steps: [
      "Each row is one member and the pair stored for them.",
      "Clear rows count toward the two approvals.",
      "Interested, unclear, declared, late and standing rows do not count, and each says why in a sentence the contract wrote.",
    ],
  },
  "ledger-spends": {
    title: "Spends in the ledger",
    what: "The whole history of this desk, readable with no wallet.",
    steps: [
      "Each spend shows its state, amount and payee.",
      "Under it are its readings: who signed, the stored pair, and the contract's sentence.",
      "Use the filter to show only recusals.",
    ],
  },
  "ledger-refusals": {
    title: "Refusals",
    what: "Calls by members that the contract turned away on a rule alone.",
    steps: [
      "Each row names who called, what they tried, and the reason.",
      "No model was asked for any of these.",
      "They are kept so the record shows the rules being applied.",
    ],
  },
  "ledger-outsiders": {
    title: "Refusals of outsiders",
    what: "Calls from addresses with no standing on any desk.",
    steps: [
      "These are kept apart so a stranger cannot push members' refusals out of a desk's record.",
      "Each row names the caller and the reason.",
    ],
  },
  "practice-accounts": {
    title: "The practice accounts",
    what: "Accounts this page keeps in your browser to play the other members of your desk.",
    steps: [
      "They are created here and funded from the test faucet.",
      "They are nobody's wallet and hold test GEN only.",
      "Their keys stay in this browser, so a reload continues the same run.",
    ],
  },
  "practice-start": {
    title: "Start the practice run",
    what: "One button that sets up a desk for you.",
    steps: [
      "Connect your wallet and take test GEN first.",
      "Press Start. The page opens a desk and enrols its practice members.",
      "Follow the rows below: each says what it is doing and what comes next.",
    ],
  },
  "practice-after": {
    title: "After the run",
    what: "What to look at once the payment and the refusal have both happened.",
    steps: [
      "Open the desk to see the balance after the payment.",
      "Open the ledger to read both readings with no wallet.",
      "Start again to run it on a fresh desk.",
    ],
  },
  "deploy-register": {
    title: "The register this browser uses",
    what: "Which copy of the contract this site is reading for you.",
    steps: [
      "By default it is the site's own register.",
      "If you deployed your own, this browser reads that one instead.",
      "The button brings you back to the site's register.",
    ],
  },
  "deploy-source": {
    title: "Contract source",
    what: "The file that would be deployed, byte for byte.",
    steps: [
      "Read the source or download it.",
      "The fingerprint lets you check that a register on chain runs exactly this file.",
    ],
  },
  "deploy-wallet": {
    title: "Deploy from your wallet",
    what: "Create your own register.",
    steps: [
      "Connect a wallet with a little test GEN.",
      "Press Deploy and sign once. It takes about a minute.",
      "Wait a minute more before the network answers reads for the new address.",
    ],
  },
};

export function SectionHelp({ k }: { k: string }) {
  const [open, setOpen] = React.useState(false);
  const h = HELP[k];
  if (!h) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Steps for: ${h.title}`}
        className="ml-2 inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 align-middle text-[11px] font-medium text-foreground/90 transition-[transform,background-color] duration-150 hover:bg-brand/25 active:scale-[0.97]"
      >
        <ListOrdered className="size-3" /> Steps
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{h.title}</DialogTitle>
            <DialogDescription className="text-sm text-foreground/85">{h.what}</DialogDescription>
          </DialogHeader>
          <ol className="grid gap-2">
            {h.steps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 text-sm text-foreground/90 text-pretty">{step}</span>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
