"use client";

// The chain's clock, ticking. A view answers with its own "now"; the pages count on from the
// moment that answer arrived, so a countdown follows chain time and not the reader's clock.

import * as React from "react";

import { chainSeconds, type Stamped } from "@/lib/chain";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};
const second = () => Math.floor(Date.now() / 1000);

/** Chain seconds now, re-rendering once a second. 0 on the server and until hydration. */
export function useChainSeconds(stamp: Stamped | null | undefined): number {
  const local = React.useSyncExternalStore(subscribe, second, () => 0);
  if (!local) return 0;
  return chainSeconds(stamp, local * 1000);
}
