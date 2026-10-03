// Site settings. One place for the register address, the desk a visitor lands on, and the name.
//
// DEMO_CONTRACT is the register the site reads when NEXT_PUBLIC_CONTRACT is unset: the one the
// run in tests/on_chain.md was made on, deployed from public/contracts/recused.py and
// byte-identical to it. With it empty every page says "no register configured yet" and offers
// /deploy, and the site still works in full with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "0x92cF8772718B76b765ba933dd9C97F447E65d219";

/** The desk the pages open when the visitor has not picked another one. */
export const DEFAULT_DESK = "D1";

export const SITE_NAME = "Recused";
export const SITE_TAGLINE = "A shared fund that will not let you countersign your own interest.";

/** The public source repository; the footer link is hidden while this is empty. */
export const REPO_URL: string = "https://github.com/hossein6191/recused";
