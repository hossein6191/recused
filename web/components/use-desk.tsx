"use client";

// Which desk the pages show. One register holds many desks; the site opens its default desk
// (lib/config DEFAULT_DESK) until the visitor picks another, and remembers the pick in this
// browser. A link may carry ?desk=D2 to open a given desk.

import * as React from "react";

import { useLocal } from "@/components/use-local";
import { DEFAULT_DESK } from "@/lib/config";
import { currentDesk, isDeskId, setCurrentDesk } from "@/lib/register";
import type { DeskRow } from "@/lib/chain";
import { gen } from "@/lib/format";

export function useDeskId(): string {
  const id = useLocal(currentDesk, DEFAULT_DESK);
  React.useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("desk") ?? "";
    if (isDeskId(fromUrl) && fromUrl !== currentDesk()) setCurrentDesk(fromUrl);
  }, []);
  return id;
}

/** A select over the desks the register lists; the choice is remembered for every page. */
export function DeskSelect({ desks, value, className }: { desks: DeskRow[]; value: string; className?: string }) {
  const known = desks.some((d) => d.id === value);
  return (
    <select
      aria-label="Desk"
      value={value}
      onChange={(e) => setCurrentDesk(e.target.value)}
      className={"h-9 max-w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm " + (className ?? "")}
    >
      {!known ? <option value={value}>{value}</option> : null}
      {desks
        .slice()
        .reverse()
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.id} · {d.label} · {gen(d.potAtto)}
          </option>
        ))}
    </select>
  );
}
