// What each section of the site is for and what a visitor can do there, step by step. One source
// for the box at the top of every page and for the full-screen menu.

export type Guide = { key: string; title: string; what: string; steps: [string, string][]; note?: string };

export const GUIDES: { href: string; match: (path: string) => boolean; guide: Guide }[] = [
  {
    match: (p) => p.startsWith("/practice"),
    href: "/practice",
    guide: {
      key: "practice",
      title: "Practice desk",
      what: "The quickest way to see everything, on your own. A spend needs three different members, so this page plays the others for you with practice accounts kept in your browser. Two tracks; every step is a real transaction.",
      steps: [
        ["Connect and get test GEN", "Press Connect wallet at the top right, then take test GEN from the faucet. It costs nothing."],
        ["Pick a track", "Be read and paid: countersign a spend yourself. Catch a hidden conflict: the version 2 track, where you prove what a member hid."],
        ["Press Start", "The page opens a small fund and enrols its practice members, each with a stake. About a minute."],
        ["Be read and paid", "File your disclosure under a public name with a 0.1 GEN stake, countersign after the notice window, and watch the spend hold, then pay."],
        ["Catch a hidden conflict", "Mara Quist hid a directorship of the payee and reads clear. Put up bond credit and cite the register page: her stake pays you."],
        ["See the refusal and the record", "On the first track press the contrast; on the second open Mara's public record."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/desk"),
    href: "/desk",
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
    href: "/enrol",
    guide: {
      key: "enrol",
      title: "Enrol",
      what: "Before you may countersign anything, you say what your own interests are. That statement is your disclosure, and it only counts for spends posted after you file it.",
      steps: [
        ["Start from an example", "Press one of the examples to fill the whole form, then change whatever is not true of you."],
        ["Write your statement", "A few plain sentences: your work, what you own or run, anything that might ask this fund for money."],
        ["Give your public name", "The name a public register would list you under. Enrolling stakes the desk's member stake, which stays yours."],
        ["Add your entries", "Each entry names one thing, a shop, an employer, a club, a person, and how you are related to it."],
        ["Declare addresses (optional)", "If a wallet address is yours, list it. A spend that pays it is refused to you at once."],
        ["File it", "One signature. From that moment you can countersign spends that are posted later."],
      ],
      note: "You can amend it later, but an amendment only counts for spends posted after the amendment.",
    },
  },
  {
    match: (p) => p === "/spend/new",
    href: "/spend/new",
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
    href: "/desk",
    guide: {
      key: "spend",
      title: "One spend",
      what: "Everything about a single spend. The name at the top, for example D1-S2, means the second spend posted on desk one.",
      steps: [
        ["Read the status", "It says which window is running, how long is left, and how many approvals the spend has."],
        ["Read the document", "This is the exact text the validators read. The contract wrote it from the facts it holds."],
        ["Identify the payee", "During the notice window a member may add one sentence saying who the payee really is."],
        ["Countersign", "After the notice window, press Countersign. Your disclosure is read against the spend twice: if it is carried out, and if it is not."],
        ["Read the result", "UU means nothing of yours moves: clear, and it counts. A pair such as GU means you gain or lose, so you are recused. The second clear approval puts the spend in its hold."],
        ["Challenge, or release", "During the hold anyone may cite a register page against a counted signature. After it, anyone may press Release and the payee is paid."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/member"),
    href: "/member",
    guide: {
      key: "member",
      title: "Your stake and record",
      what: "Version 2: what you put up to sign, the signatures it answers for, and the public record of what register pages found.",
      steps: [
        ["Read your stake", "Whole means you may countersign. A slashed stake must be restaked first."],
        ["Read the record", "Hidden conflicts proven and challenges survived, counted by the contract."],
        ["Restake, retire, or take it back", "Restake after a slash, retire for good, and withdraw the stake once nothing you signed is open."],
        ["Bond credit", "What your own challenges are bonded from. Withdraw it whenever you like."],
      ],
    },
  },
  {
    match: (p) => p.startsWith("/ledger"),
    href: "/ledger",
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
    href: "/deploy",
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

/** The landing page's own entry, for the menu. */
export const HOME_GUIDE: { href: string; guide: Guide } = {
  href: "/",
  guide: {
    key: "home",
    title: "Start here",
    what: "What Recused is and what it checks, in five steps, with one reading shown from start to finish.",
    steps: [
      ["Read the five steps", "From filing your interests to the payment leaving the fund."],
      ["Watch one reading", "The terminal plays a member being refused and another being counted."],
      ["Go to the practice desk", "The button takes you to the page where you can do all of it yourself."],
    ],
  },
};
