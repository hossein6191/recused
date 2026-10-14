// What every in-between moment of version 2 says, for whoever is looking at it. One pure function:
// a state, a role and the chain's clock in, five plain lines out, answering the same five
// questions every time: what is happening and who it waits for, how long, whether anything is
// needed from you now, whether you can leave, and where the money is right now. No React in here,
// so node tests every state against every role (tests/unit/waiting.test.mjs).

import { gen, span } from "./format";

export type WaitLines = { what: string; howLong: string; act: string; leave: string; money: string };

/** Who is looking: a counted signer, the poster, a challenger, a funder, or anyone else. */
export type WaitRole = "signer" | "poster" | "challenger" | "funder" | "anyone";
export const WAIT_ROLES: WaitRole[] = ["signer", "poster", "challenger", "funder", "anyone"];

export type WaitState =
  /** two clear readings are counted and the hold runs; anyone may cite a register page */
  | { kind: "holding"; label: string; now: number; holdUntil: number; amountAtto: string; stakeAtto: string; bondAtto: string; challenges: number }
  /** the hold has ended; anyone may release the payment */
  | { kind: "releasable"; label: string; amountAtto: string }
  /** a challenge is with the validators: each fetches the page and reads it four times */
  | { kind: "challenge"; label: string; publicName: string; page: string; bondAtto: string; stakeAtto: string; amountAtto: string }
  /** a register page struck a signature: the hold ended and the spend is back to open (or expired) */
  | { kind: "struck"; label: string; publicName: string; slashedAtto: string; bountyAtto: string; toDeskAtto: string; amountAtto: string; expired: boolean }
  /** the release paid the payee */
  | { kind: "released"; label: string; amountAtto: string }
  /** a member's stake was slashed: they may not countersign until it is whole again */
  | { kind: "restake"; desk: string; publicName: string; missingAtto: string; holdsOpen: number }
  /** a member retired from countersigning; the stake comes back once nothing they signed is open */
  | { kind: "retired"; desk: string; stakeAtto: string; signedOpen: number; holdsOpen: number };

export const WAIT_KINDS: WaitState["kind"][] = ["holding", "releasable", "challenge", "struck", "released", "restake", "retired"];

/** The five lines for one state, as one role sees it. */
export function waitingCopy(w: WaitState, role: WaitRole): WaitLines {
  switch (w.kind) {
    case "holding": {
      const left = Math.max(0, w.holdUntil - w.now);
      return {
        what: `${w.label} has two clear countersignatures and is in its hold. Until the hold ends, anyone may cite a page of one of the desk's named registers against either counted signature, and every validator reads it on the live web.${w.challenges ? ` ${w.challenges} ${w.challenges === 1 ? "page has" : "pages have"} been read against it so far.` : ""}`,
        howLong: w.now ? `The hold ends in ${span(left)}, on the chain's clock. After that anyone may release the payment.` : "The hold's end is read from the chain's clock in a moment.",
        act:
          role === "signer"
            ? "Nothing is needed from you. Your signature stands unless a register page shows a relation to the payee your disclosure left out."
            : role === "challenger"
              ? `If you know a register page that shows such a relation, cite it before the hold ends: it stakes ${gen(w.bondAtto)} of your bond credit.`
              : role === "poster"
                ? "Nothing is needed from you. When the hold ends, anyone, you included, may press Release."
                : `Nothing is needed from you. If you know a register page that shows a hidden relation, you may cite it; it stakes ${gen(w.bondAtto)} of bond credit.`,
        leave: "You can leave. The hold runs on the chain whether or not this page is open, and this page shows where it stands when you come back.",
        money:
          role === "signer"
            ? `Your stake of ${gen(w.stakeAtto)} is held on the desk, where a register page could take it. ${gen(w.amountAtto)} is still committed in the pot; nothing has been paid.`
            : role === "funder"
              ? `${gen(w.amountAtto)} of the pot is committed to ${w.label} and stays there through the hold; nothing has been paid.`
              : `${gen(w.amountAtto)} is still committed in the desk's pot; nothing has left it. Each counted signer's stake of ${gen(w.stakeAtto)} is held on the desk.`,
      };
    }
    case "releasable":
      return {
        what: `The hold of ${w.label} has ended with both signatures standing. It waits for anyone to release it; nobody may cite a page against it any more.`,
        howLong: "Releasing is one transaction, usually under a minute; the payee is paid in it.",
        act: role === "anyone" || role === "challenger" ? "You may press Release; it needs no membership and decides nothing." : "You may press Release, or leave it to anyone else; the outcome is the same.",
        leave: "You can leave. The spend stays ready to release for as long as it takes; a spend in its hold never expires.",
        money: `${gen(w.amountAtto)} is committed in the pot until the release moves it to the payee.`,
      };
    case "challenge":
      return {
        what: `Every validator is fetching ${w.page} itself, fingerprinting what it read, and asking two questions about ${w.publicName}'s signature on ${w.label}, each in two presentation orders. They must agree on the finding and the fingerprint, or nothing is stored.`,
        howLong: "Usually one to three minutes: a page fetch and four model readings on each validator.",
        act: role === "challenger" ? "Nothing more is needed from you; the result appears here by itself." : "Nothing is needed from you.",
        leave: "You can leave. The transaction runs on the chain either way, and its result stays on the spend's page.",
        money:
          role === "challenger"
            ? `Your bond of ${gen(w.bondAtto)} is still in your bond credit. It leaves only if the page names ${w.publicName} and shows nothing they hid (clean), and then it goes to them. If the page proves a hidden relation, half of their stake of ${gen(w.stakeAtto)} comes to you in this same transaction.`
            : role === "signer"
              ? `Your stake of ${gen(w.stakeAtto)} is on the desk. A hidden finding slashes it whole; a clean one pays you the challenger's bond of ${gen(w.bondAtto)}.`
              : `${gen(w.amountAtto)} stays committed in the pot whatever the finding. ${w.publicName}'s stake of ${gen(w.stakeAtto)} is on the desk.`,
      };
    case "struck":
      return {
        what: `A register page showed a relation of ${w.publicName}'s to the payee that their disclosure left out. Their signature on ${w.label} is struck and stands struck for the rest of its run, the hold ended, and ${w.expired ? `${w.label} expired, because its window had passed` : `${w.label} is open again and needs one more clear countersignature`}.`,
        howLong: w.expired
          ? "Nothing more happens to this spend; the same payment may be posted again."
          : "Another member's clear reading puts it in a fresh hold; one transaction, one to two minutes, any time before its window ends.",
        act:
          role === "signer"
            ? "You may not countersign on this desk until your stake is whole again: restake from your member page, or retire."
            : role === "challenger"
              ? "Nothing more is needed from you. Your bond stayed in your credit; withdraw it whenever you like."
              : w.expired
                ? "Nothing is needed from you."
                : "Nothing is needed from you, unless you are a member who enrolled before the spend and want to countersign it.",
        leave: "You can leave. Everything here is settled on the chain.",
        money:
          role === "challenger"
            ? `${gen(w.bountyAtto)} of the slashed stake was paid to you in that transaction, and ${gen(w.toDeskAtto)} went into the desk's pot.`
            : role === "signer"
              ? `Your whole stake of ${gen(w.slashedAtto)} was slashed: ${gen(w.bountyAtto)} to the challenger and ${gen(w.toDeskAtto)} into the desk's pot.`
              : `${gen(w.slashedAtto)} was slashed: ${gen(w.bountyAtto)} to the challenger, ${gen(w.toDeskAtto)} into the pot. ${w.expired ? `${gen(w.amountAtto)} is no longer committed.` : `${gen(w.amountAtto)} stays committed to ${w.label}.`}`,
      };
    case "released":
      return {
        what: `${w.label} was released after its hold: both signatures stood, and the payee was paid in the release transaction.`,
        howLong: "Nothing more happens to this spend.",
        act: "Nothing is needed from you.",
        leave: "You can leave; it is finished.",
        money:
          role === "signer"
            ? `${gen(w.amountAtto)} left the pot for the payee. Your stake stays on the desk; it no longer answers for this signature.`
            : role === "funder"
              ? `${gen(w.amountAtto)} left the pot for the payee, borne by the funders whose money was in the desk.`
              : `${gen(w.amountAtto)} left the pot for the payee.`,
      };
    case "restake":
      return {
        what: `${w.publicName}'s stake on ${w.desk} is not whole, after a register page struck a signature. Until it is, the contract refuses their countersignatures before any model is asked, and the attempt is not spent.`,
        howLong: "Restaking is one transaction, under a minute, any time.",
        act:
          role === "signer"
            ? `To countersign again, restake exactly ${gen(w.missingAtto)}. Or retire and leave the desk.`
            : "Nothing is needed from you.",
        leave: "You can leave; nothing here runs out.",
        money:
          role === "signer"
            ? `${gen(w.missingAtto)} of your stake is missing.${w.holdsOpen ? ` You still have ${w.holdsOpen} counted ${w.holdsOpen === 1 ? "signature" : "signatures"} in a hold.` : ""}`
            : `${w.publicName}'s stake is ${gen(w.missingAtto)} short; the slashed part went to the challenger and into the pot.`,
      };
    case "retired":
      return {
        what: `This member has retired from countersigning on ${w.desk}, for good. ${w.signedOpen ? `Their reading still counts on ${w.signedOpen} spend${w.signedOpen === 1 ? "" : "s"} that ${w.signedOpen === 1 ? "has" : "have"} not ended${w.holdsOpen ? `, ${w.holdsOpen} of them in a hold` : ""}.` : "Nothing they signed is still open."}`,
        howLong: w.signedOpen
          ? "The stake can be withdrawn once each spend they signed is paid, expires, or has that signature struck."
          : "The stake can be withdrawn now: one transaction, under a minute.",
        act: role === "signer" ? (w.signedOpen ? "Nothing is needed from you yet; come back once those spends have ended." : "Press Withdraw stake to take it back.") : "Nothing is needed from you.",
        leave: "You can leave. The stake waits on the desk for as long as it takes.",
        money: `${gen(w.stakeAtto)} of stake is held on the desk${w.signedOpen ? ", where a register page can still reach it" : ""}.`,
      };
  }
}
