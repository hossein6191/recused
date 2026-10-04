"use client";

// A small terminal window that plays its lines one after another, the first of each group typed
// out. Used on the landing page to show one reading from start to finish. It starts when it
// scrolls into view, and with reduced motion every line is simply there.

import * as React from "react";

import { cn } from "@/lib/utils";

export type TerminalLine = { text: string; tone?: "cmd" | "ok" | "warn" | "bad" | "dim"; typed?: boolean };

const TONE: Record<NonNullable<TerminalLine["tone"]>, string> = {
  cmd: "text-foreground",
  ok: "text-keeps",
  warn: "text-gold",
  bad: "text-breaks",
  dim: "text-muted-foreground",
};

export function Terminal({ lines, className, title }: { lines: TerminalLine[]; className?: string; title?: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = React.useState(0); // lines fully shown
  const [chars, setChars] = React.useState(0); // characters of the line being typed
  const [started, setStarted] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setStarted(true), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    if (!started || shown >= lines.length) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const line = lines[shown];
    if (still) {
      const t = setTimeout(() => setShown(lines.length), 0);
      return () => clearTimeout(t);
    }
    if (line.typed && chars < line.text.length) {
      const t = setTimeout(() => setChars((c) => c + 1), 22);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setChars(0);
        setShown((n) => n + 1);
      },
      line.typed ? 350 : 420,
    );
    return () => clearTimeout(t);
  }, [started, shown, chars, lines]);

  return (
    <div ref={ref} className={cn("w-full overflow-hidden rounded-2xl border border-white/10 bg-black/60 backdrop-blur-sm", className)}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-red-500/80" />
        <span className="size-2.5 rounded-full bg-yellow-500/80" />
        <span className="size-2.5 rounded-full bg-green-500/80" />
        {title ? <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span> : null}
      </div>
      <pre className="min-h-64 p-4 text-[12.5px] leading-relaxed">
        <code className="grid gap-y-1 font-mono whitespace-pre-wrap">
          {lines.map((l, i) => {
            if (i > shown) return null;
            const text = i === shown ? (l.typed ? l.text.slice(0, chars) : "") : l.text;
            if (i === shown && !l.typed) return null;
            return (
              <span key={i} className={cn(TONE[l.tone ?? "dim"])}>
                {text}
                {i === shown && l.typed ? <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-foreground/70" /> : null}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
