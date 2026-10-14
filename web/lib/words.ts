// The site's own wording for what the contract stores: verdicts, the two characters of a value,
// and the contract's refusal texts turned into sentences a person can act on. No React here.

import { TOKEN_PHRASE, type ChallengeVerdict, type Phase, type Verdict } from "./contract";
import { gen, span, when } from "./format";

/** One or two words for a verdict, for a badge. */
export function verdictLabel(v: Verdict): string {
  switch (v) {
    case "clear":
      return "Clear, counted";
    case "interested":
      return "Recused: an interest moves";
    case "unclear":
      return "Recused: not settled";
    case "declared":
      return "Recused: declared address";
    case "late":
      return "Recused: filed after the spend";
    case "standing":
      return "Recused: an earlier reading stands";
    default:
      return "No verdict";
  }
}

/** What the verdict means for the member, in one plain sentence. */
export function verdictMeaning(v: Verdict): string {
  switch (v) {
    case "clear":
      return "Nothing this member filed moves whether the spend is carried out or not, so the countersignature counts.";
    case "interested":
      return "Something this member filed is better or worse off under at least one branch, so the member stands aside on this spend. It is not a finding of wrongdoing: it is what the disclosure was filed for.";
    case "unclear":
      return "The reading did not come back as nothing moved under both branches, so the member stands aside on this spend. Nothing was found against them; a vague entry or an unstable answer is enough.";
    case "declared":
      return "The payee is an address this member declared as their own, so the contract refused with no model asked. The declaration did its job.";
    case "late":
      return "This member's disclosure carries a higher sequence number than the first spend posted to this payee and not since paid, so it is never read against this spend. Nobody may write or revise a disclosure after seeing what they want to approve, and posting the same payment again under a new number does not change that.";
    case "standing":
      return "This member was already read on an earlier spend to this same payee, and that reading was not clear. It stands until a spend to this payee is paid, so the contract refused with no model asked: posting the same payment again does not buy a second reading.";
    default:
      return "";
  }
}

/** The contract's phrase for one character of a value, with a capital. */
export function tokenPhrase(ch: string): string {
  const p = TOKEN_PHRASE[ch] ?? "the contract stored a character this site does not know";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** One word for a character, for the tile under it. */
export function tokenWord(ch: string): string {
  switch (ch) {
    case "G":
      return "better off";
    case "L":
      return "worse off";
    case "U":
      return "not moved";
    case "?":
      return "too vague";
    case "/":
      return "unstable";
    case "x":
      return "unreadable";
    case "-":
      return "not asked";
    default:
      return "unknown";
  }
}

/** The phase of a spend in a few words. */
export function phaseLabel(p: Phase): string {
  switch (p) {
    case "notice":
      return "Notice window";
    case "approvals":
      return "Open for countersignatures";
    case "overdue":
      return "Window closed, awaiting expiry";
    case "holding":
      return "In its hold, open to challenge";
    case "releasable":
      return "Hold over, ready to release";
    case "paid":
      return "Paid";
    case "expired":
      return "Expired";
  }
}

/** The heading of a challenge's result card. */
export function challengeLabel(v: ChallengeVerdict): string {
  switch (v) {
    case "hidden":
      return "Hidden conflict proven";
    case "clean":
      return "Clean";
    case "unclear":
      return "Unclear";
    case "repeat":
      return "Repeat, settles nothing";
  }
}

/** What a challenge's finding means, in one plain sentence. */
export function challengeMeaning(v: ChallengeVerdict): string {
  switch (v) {
    case "hidden":
      return "Every validator read the page and agreed it shows a present relation to the payee that the member's disclosure leaves out. The signature is struck, the hold ended, and the member's stake was slashed in that transaction.";
    case "clean":
      return "The page names the member and shows nothing about the payee their disclosure left out, so the accusation was wrong: the challenger's bond went to the member, and the signature still counts.";
    case "unclear":
      return "The validators did not agree on either pattern: the page may not name the member, may show only a former relation, or may not let them decide. Nothing changed, and the bond stayed in the challenger's credit.";
    case "repeat":
      return "This page reads the same as one already read against this signature, under another address. Nothing is settled twice, and the bond stayed in the challenger's credit.";
  }
}

/**
 * A contract refusal as a sentence. The contract already writes its reasons in words; this
 * drops the error tag, turns the clock values it prints (seconds since 1970) into a time of day,
 * turns long atto figures into GEN, and gives the text a capital and a full stop.
 */
export function sentence(reason: string): string {
  let t = String(reason ?? "")
    .replace(/^\s*\[(EXPECTED|TRANSIENT)\]\s*/i, "")
    .trim();
  if (!t) return "";
  t = t.replace(/another (\d+) seconds/g, (_, n: string) => "another " + span(Number(n)));
  t = t.replace(/\b(1[6-9]\d{8}|2\d{9})\b/g, (m: string) => when(Number(m)) || m);
  t = t.replace(/\b(\d{9,}) atto\b/g, (_, n: string) => gen(n));
  t = t.replace(/expire\((D\d+), (\d+)\)/g, "expire it (spend S$2 of desk $1) from its page");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}
