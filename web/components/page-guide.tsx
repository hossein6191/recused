"use client";

// What each page is for, and what a visitor can do on it, step by step. One box at the top of
// every page except the landing page, open the first time and remembered once it is folded away.

import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Compass } from "lucide-react";

import { useLocal } from "@/components/use-local";
import { readItem, writeItem, notify } from "@/lib/browser-store";
import { GUIDES } from "@/lib/guides";
import { cn } from "@/lib/utils";

export function PageGuide() {
  const pathname = usePathname() || "/";
  const found = GUIDES.find((g) => g.match(pathname));
  const storeKey = found ? `recused:guide:${found.guide.key}` : "";
  const closed = useLocal(() => (storeKey ? readItem(storeKey) === "closed" : false), false);
  if (!found) return null;
  const g = found.guide;
  const toggle = () => {
    writeItem(storeKey, closed ? null : "closed");
    notify();
  };
  return (
    <div className="container-site pt-6">
      <section aria-label={`What the ${g.title} page is for`} className="rounded-2xl border border-brand/30 bg-brand/[0.07] backdrop-blur-sm">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!closed}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-white">
            <Compass className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">What this page is for, step by step</span>
            <span className="block truncate text-xs text-muted-foreground">{closed ? "Press to open the guide for this page" : g.title}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", closed ? "" : "rotate-180")} />
        </button>
        {closed ? null : (
          <div className="space-y-4 px-4 pb-4">
            <p className="text-sm text-foreground/90 text-pretty">{g.what}</p>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.steps.map(([title, body], i) => (
                <li key={title} className="flex gap-3 rounded-xl border border-white/10 bg-black/25 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/25 text-xs font-semibold text-foreground">{i + 1}</span>
                  <span className="min-w-0 text-xs">
                    <span className="block font-medium text-foreground">{title}</span>
                    <span className="block text-muted-foreground text-pretty">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            {g.note ? <p className="text-xs text-muted-foreground">{g.note}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
