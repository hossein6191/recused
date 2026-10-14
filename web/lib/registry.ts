// The demonstration register: the Estuary Companies Register in the repository's registry/ folder,
// a fictional public register whose pages a desk may name and a challenge may cite. No React and
// no chain access here, so node runs it as it is (tests/unit/*.test.mjs).
//
// A desk names its registers by address prefix when it is opened, for good. The validators each
// fetch a cited page themselves, so the page has to be the same bytes for every one of them and
// for as long as the desk lives. raw.githubusercontent.com at one commit is exactly that; a branch
// is not, which is why the "catch a hidden conflict" track waits for lib/config.ts REGISTRY_COMMIT.

import { REGISTRY_COMMIT, REGISTRY_REPO } from "./config";

export const COMMIT_RE = /^[0-9a-f]{40}$/;
export const REGISTRY_HOST = "https://raw.githubusercontent.com/";

/** The registry/ folder of this repository at one ref, as a register prefix (it ends with "/"). */
export const registryPrefixAt = (ref: string): string => `${REGISTRY_HOST}${REGISTRY_REPO}/${ref}/registry/`;

/** The pinned register prefix, or "" while lib/config.ts REGISTRY_COMMIT is not a commit. */
export const pinnedRegistry = (): string => (COMMIT_RE.test(REGISTRY_COMMIT) ? registryPrefixAt(REGISTRY_COMMIT) : "");

/**
 * The prefix a desk that never cites a page names (the first practice track, and the demo
 * content): the pinned one when there is one, otherwise the branch head. A desk must name at
 * least one register; nobody cites one on these desks, and a page that changed under a branch
 * would only make a challenge read unclear or fail to agree, never strike anybody.
 */
export const everydayRegistry = (): string => pinnedRegistry() || registryPrefixAt("main");

export type RegisterPage = {
  file: string;
  company: string;
  /** what the page shows, in a few words, for the chip and the result card */
  shows: string;
};

/** The four pages of the demonstration register, in the order the site offers them. */
export const REGISTER_PAGES: RegisterPage[] = [
  { file: "gull-catering-ltd.html", company: "Gull Catering Ltd", shows: "Mara Quist is a current director of Gull Catering Ltd and holds 40 percent of it" },
  { file: "pelican-press-ltd.html", company: "Pelican Press Ltd", shows: "Mara Quist and her sister own and direct Pelican Press Ltd" },
  { file: "heron-signs-ltd.html", company: "Heron Signs Ltd", shows: "two officers, neither of them a member of a demonstration desk" },
  { file: "osprey-paper-ltd-former-officers.html", company: "Osprey Paper Ltd", shows: "Mara Quist was a director until 2018 and is no longer" },
];

/** True when a prefix is this repository's registry/ folder at some ref, so its pages are the four above. */
export const isDemoRegistry = (prefix: string): boolean =>
  prefix.startsWith(`${REGISTRY_HOST}${REGISTRY_REPO}/`) && prefix.endsWith("/registry/");

/**
 * The text inside each page's one <pre> block, exactly as the files in registry/ hold it. Demo
 * mode serves these in place of the web (a test compares them with the files); on the chain the
 * validators fetch the pages themselves and nothing here is used.
 */
export const REGISTER_TEXT: Record<string, string> = {
  "gull-catering-ltd.html": `ESTUARY COMPANIES REGISTER - demonstration edition
Register extract for one company

Company name: Gull Catering Ltd
Company number: EC 04417
Status: active
Registered office: 9 Harbour Row, Estuary Bay
Nature of business: catering for events, meetings and street fairs
Incorporated: 12 June 2016

Current officers:
Owen Sallis, director and company secretary, appointed 12 June 2016
Mara Quist, director, appointed 4 March 2019

Persons with significant control:
Owen Sallis, holds 60 percent of the shares
Mara Quist, holds 40 percent of the shares

Former officers: none
`,
  "pelican-press-ltd.html": `ESTUARY COMPANIES REGISTER - demonstration edition
Register extract for one company

Company name: Pelican Press Ltd
Company number: EC 03986
Status: active
Registered office: 41 Pelican Street, Estuary Bay
Nature of business: a two-person print shop: reports, programmes and notices
Incorporated: 2 May 2017

Current officers:
Mara Quist, director, appointed 2 May 2017
Ilse Quist, director, appointed 2 May 2017

Persons with significant control:
Mara Quist, holds 50 percent of the shares
Ilse Quist, holds 50 percent of the shares

Former officers: none
`,
  "heron-signs-ltd.html": `ESTUARY COMPANIES REGISTER - demonstration edition
Register extract for one company

Company name: Heron Signs Ltd
Company number: EC 05132
Status: active
Registered office: 2 Quay Lane, Estuary Bay
Nature of business: painted and printed signs, banners and shop fronts
Incorporated: 1 September 2020

Current officers:
Petra Lund, director, appointed 1 September 2020
Callum Reyes, company secretary, appointed 1 September 2020

Persons with significant control:
Petra Lund, holds 100 percent of the shares

Former officers: none
`,
  "osprey-paper-ltd-former-officers.html": `ESTUARY COMPANIES REGISTER - demonstration edition
Register extract for one company: FORMER OFFICERS

Company name: Osprey Paper Ltd
Company number: EC 02871
Status: active
Registered office: 17 Mill Wharf, Estuary Bay
Nature of business: paper and card supplies for printers
Incorporated: 1 May 2015

Current officers:
Gwen Hartley, director, appointed 1 October 2018

Former officers:
Mara Quist, director, appointed 1 May 2015, resigned 30 September 2018

Persons with significant control:
Gwen Hartley, holds 100 percent of the shares
`,
};

/** The page a URL names, by its last segment; null for anything else. */
export function registerPageOf(url: string): RegisterPage | null {
  const file = url.slice(url.lastIndexOf("/") + 1);
  return REGISTER_PAGES.find((p) => p.file === file) ?? null;
}
