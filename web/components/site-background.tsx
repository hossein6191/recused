"use client";

// The whole site sits on GenLayer's gradient: one canvas, fixed behind every page, with a dark
// scrim over it so text keeps its contrast. It draws nothing while the tab is hidden, and a
// visitor who asks for reduced motion gets a single still frame (see components/ui/velaris.tsx).

import { Velaris } from "@/components/ui/velaris";

/** GenLayer's own gradient, on the dark plate the brand sets it against. */
export const GENLAYER_COLORS = ["#110FFF", "#9B6AF6", "#E37DF7", "#0B0E11"];
export const GENLAYER_BG = "#0B0E11";

export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Velaris height="100%" bg={GENLAYER_BG} colors={GENLAYER_COLORS} speed={0.9} grain={0.2} />
      <div className="absolute inset-0 bg-background/70" />
    </div>
  );
}
