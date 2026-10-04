"use client";

// A row of suggestions under a field: press one and the field (or the whole form) is filled with
// something real to start from. Everything stays editable afterwards.

import * as React from "react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function Suggest<T>({
  label = "Suggestions",
  options,
  onPick,
  disabled,
  className,
}: {
  label?: string;
  options: { label: string; value: T }[];
  onPick: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {label ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Sparkles className="size-3" /> {label}
        </span>
      ) : null}
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(o.value)}
          className="cursor-pointer rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-foreground/85 transition-[transform,background-color,border-color] duration-150 ease-out hover:border-brand/60 hover:bg-brand/15 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
