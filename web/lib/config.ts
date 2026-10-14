// Site settings. One place for the register address, the desk a visitor lands on, and the name.
//
// DEMO_CONTRACT is the register the site reads when NEXT_PUBLIC_CONTRACT is unset. It is still the
// version 1 register the run in tests/on_chain.md was made on; the version 2 contract in
// public/contracts/recused.py takes other arguments, so once version 2 is deployed its address
// replaces this one (or is set as NEXT_PUBLIC_CONTRACT). Until then the pages read the register's
// version from rule() and say plainly that the version 2 paths need a version 2 register. With it
// empty every page says "no register configured yet" and offers /deploy, and the site still works
// in full with NEXT_PUBLIC_MOCK=1.
export const DEMO_CONTRACT: string = "0x92cF8772718B76b765ba933dd9C97F447E65d219";

/** The desk the pages open when the visitor has not picked another one. */
export const DEFAULT_DESK = "D1";

export const SITE_NAME = "Recused";
export const SITE_TAGLINE = "A shared fund that will not let you countersign your own interest.";

/** The public source repository; the footer link is hidden while this is empty. */
export const REPO_URL: string = "https://github.com/hossein6191/recused";

/** The same repository as owner/name, where raw.githubusercontent.com serves the demonstration register from. */
export const REGISTRY_REPO = "hossein6191/recused";

/**
 * The commit of this repository whose registry/ folder the "catch a hidden conflict" practice
 * track names as its desk's one register: 40 lowercase hex characters, or "" until registry/ has
 * been pushed and that commit pasted here. A desk names its registers for good when it is opened,
 * and every validator fetches the page itself, so the page must be the same bytes for all of them
 * and for as long as the desk lives; a branch would not be. While this is empty the track says why
 * it cannot start, and nothing else on the site depends on it.
 */
export const REGISTRY_COMMIT: string = "";
