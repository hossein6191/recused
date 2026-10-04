"use client";

// The whole site sits on a moving mesh of GenLayer's own colours: one shader layer for the colour,
// a second, fainter one moving against it for depth, and a dark scrim so text keeps its contrast.
// A visitor who asks for reduced motion gets both layers standing still.

import * as React from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/** GenLayer's gradient, on black. */
const BASE = ["#000000", "#110FFF", "#1b1147", "#9B6AF6", "#E37DF7"];
const VEIL = ["#000000", "#9B6AF6", "#110FFF", "#E37DF7"];

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function SiteBackground() {
  const still = React.useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <MeshGradient className="absolute inset-0 h-full w-full" colors={BASE} speed={still ? 0 : 0.3} distortion={0.8} swirl={0.15} />
      <MeshGradient
        className="absolute inset-0 h-full w-full opacity-40 mix-blend-screen"
        colors={VEIL}
        speed={still ? 0 : 0.2}
        distortion={1}
        swirl={0.7}
        grainOverlay={0.12}
      />
      <div className="absolute inset-0 bg-background/50" />
    </div>
  );
}
