"use client";

// A label whose letters swap, in a random order, when it is hovered: each letter slides up and
// its twin slides in from below.

import * as React from "react";
import { motion, type Transition } from "motion/react";

import { cn } from "@/lib/utils";

export function RandomLetterSwap({
  label,
  className,
  staggerDuration = 0.025,
  transition = { type: "spring", duration: 0.6 },
}: {
  label: string;
  className?: string;
  staggerDuration?: number;
  transition?: Transition;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [order, setOrder] = React.useState<number[]>(() => [...label].map((_, i) => i));
  const enter = () => {
    // A fresh random order each time, picked in the handler so render stays pure.
    const idx = [...label].map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    setOrder(idx);
    setHovered(true);
  };
  return (
    <span className={cn("relative inline-flex overflow-hidden", className)} onMouseEnter={enter} onMouseLeave={() => setHovered(false)}>
      <span className="sr-only">{label}</span>
      {[...label].map((ch, i) => (
        <span key={i} aria-hidden className="relative inline-block whitespace-pre">
          <motion.span
            className="inline-block"
            animate={{ y: hovered ? "-110%" : "0%" }}
            transition={{ ...transition, delay: order.indexOf(i) * staggerDuration }}
          >
            {ch}
          </motion.span>
          <motion.span
            className="absolute top-0 left-0 inline-block"
            initial={{ y: "110%" }}
            animate={{ y: hovered ? "0%" : "110%" }}
            transition={{ ...transition, delay: order.indexOf(i) * staggerDuration }}
          >
            {ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
