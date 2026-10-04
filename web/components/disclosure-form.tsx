"use client";

// The disclosure a member files: a statement, one to six entries (a counterparty or an activity
// and the relation to it, from the contract's closed list), and any addresses they declare as
// their own. Used to enrol and to amend. Every limit is checked here in the contract's own
// terms before anything is signed, so a refusal at the door is rare and explained when it comes.

import * as React from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Suggest } from "@/components/suggest";
import { RELATIONS, RELATION_OTHER, textProblem, type EntryInput, type Limits } from "@/lib/chain";
import { isAddress } from "@/lib/register";
import { cn } from "@/lib/utils";

export type Disclosure = { statement: string; entries: EntryInput[]; addresses: string[] };

export const EMPTY_DISCLOSURE: Disclosure = {
  statement: "",
  entries: [{ name: "", relation: "employed_by", detail: "" }],
  addresses: [],
};

/** Whole disclosures to start from: press one and every part of the form is filled. */
const PROFILES: { label: string; value: Disclosure }[] = [
  {
    label: "Bakery worker with a market stall",
    value: {
      statement:
        "I work part time at the Marlow Road bakery and sell honey from two hives at the Saturday market. I have no other paid work and sit on no committee.",
      entries: [
        { name: "Marlow Road Bakery", relation: "employed_by", detail: "counter work, three mornings a week" },
        { name: "Saturday market honey stall", relation: "owns", detail: "my own stall, two hives" },
      ],
      addresses: [],
    },
  },
  {
    label: "Teacher, nothing else",
    value: {
      statement:
        "I teach year four at Hillside Primary School. I own no business, sit on no committee and sell nothing to anybody in this building.",
      entries: [{ name: "Hillside Primary School", relation: "employed_by", detail: "full time class teacher" }],
      addresses: [],
    },
  },
  {
    label: "Part owner of a shop",
    value: {
      statement:
        "I own half of Quay Street Cycles with my brother and we repair and sell bicycles. The shop sometimes quotes for work on the shared bike store.",
      entries: [
        { name: "Quay Street Cycles", relation: "part_owns", detail: "a bicycle shop; I hold half of it" },
        { name: "my brother Daniel", relation: "family", detail: "he holds the other half of the shop" },
      ],
      addresses: [],
    },
  },
  {
    label: "Chair of a club that asks for money",
    value: {
      statement:
        "I chair the residents' gardening club, which keeps its own small kitty and asks this fund for seed and tool money most springs. I am retired and have no paid work.",
      entries: [{ name: "Residents' gardening club", relation: "officer_of", detail: "chair since last year; the club applies to this fund" }],
      addresses: [],
    },
  },
  {
    label: "Freelancer with one big client",
    value: {
      statement:
        "I am a freelance electrician. Most of my work this year has come from Harbour Lettings, who manage two flats in this building. I rent my own flat here.",
      entries: [
        { name: "Harbour Lettings", relation: "supplies", detail: "I do their electrical call-outs" },
        { name: "the building's landlord", relation: "tenant_of", detail: "I rent flat 6" },
      ],
      addresses: [],
    },
  },
];

/** Single entries to drop into one slot. */
const ENTRY_IDEAS: { label: string; value: EntryInput }[] = [
  { label: "My employer", value: { name: "Marlow Road Bakery", relation: "employed_by", detail: "counter work, three mornings a week" } },
  { label: "A shop I part own", value: { name: "Quay Street Cycles", relation: "part_owns", detail: "a bicycle shop; I hold half of it" } },
  { label: "A club I chair", value: { name: "Residents' gardening club", relation: "officer_of", detail: "chair; the club applies to this fund" } },
  { label: "A family member", value: { name: "my sister Ruth", relation: "family", detail: "she runs the print shop on Quay Street" } },
  { label: "My landlord", value: { name: "the building's landlord", relation: "tenant_of", detail: "I rent a flat here" } },
  { label: "Somebody I supply", value: { name: "Harbour Lettings", relation: "supplies", detail: "I do their electrical call-outs" } },
  { label: "Where I volunteer", value: { name: "Saturday food bank", relation: "volunteers_for", detail: "two shifts a month, unpaid" } },
];

/** Why this disclosure would be refused at the door, or "" when it may be filed. */
export function disclosureProblem(d: Disclosure, limits: Limits): string {
  const statement = d.statement.trim();
  let p = textProblem(statement, limits.statement[0], limits.statement[1], "The statement");
  if (p) return p;
  if (d.entries.length < limits.entries[0] || d.entries.length > limits.entries[1])
    return `File ${limits.entries[0]} to ${limits.entries[1]} entries.`;
  for (let i = 0; i < d.entries.length; i++) {
    const e = d.entries[i];
    const where = "entry " + (i + 1);
    p = textProblem(e.name.trim(), limits.entryName[0], limits.entryName[1], "The name of " + where);
    if (p) return p;
    if (e.detail.trim()) {
      p = textProblem(e.detail.trim(), 1, limits.entryDetail, "The detail of " + where);
      if (p) return p;
    }
    if (e.relation === RELATION_OTHER && e.detail.trim().length < limits.otherDetail)
      return `Entry ${i + 1} uses "another relation", so its detail says what the relation is, in at least ${limits.otherDetail} characters.`;
  }
  const addresses = d.addresses.map((a) => a.trim()).filter(Boolean);
  if (addresses.length > limits.declared) return `At most ${limits.declared} declared addresses.`;
  const bad = addresses.find((a) => !isAddress(a));
  if (bad) return `Each declared address is 0x followed by 40 hexadecimal characters. This one is not: ${bad.slice(0, 46)}`;
  return "";
}

const Count = ({ value, range }: { value: number; range: [number, number] }) => (
  <span className={cn("text-[11px]", value < range[0] || value > range[1] ? "text-gold" : "text-muted-foreground")}>
    {value} / {range[1]} (at least {range[0]})
  </span>
);

export function DisclosureForm({
  value,
  onChange,
  limits,
  disabled,
}: {
  value: Disclosure;
  onChange: (next: Disclosure) => void;
  limits: Limits;
  disabled?: boolean;
}) {
  const setEntry = (i: number, patch: Partial<EntryInput>) =>
    onChange({ ...value, entries: value.entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setAddress = (i: number, a: string) => onChange({ ...value, addresses: value.addresses.map((x, k) => (k === i ? a : x)) });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="space-y-2 rounded-xl border border-brand/25 bg-brand/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Wand2 className="size-3.5 text-brand" /> Fill the whole form from an example, then change what is not true of you
          </p>
          <Suggest label="Start as" options={PROFILES} onPick={onChange} disabled={disabled} />
        </div>
        <Label htmlFor="statement">Your statement</Label>
        <Textarea
          id="statement"
          value={value.statement}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, statement: e.target.value })}
          placeholder="In your own words: what you do for a living, what you own or help run, and anything that might ask this fund for money."
          rows={4}
        />
        <Suggest
          label="Or only the statement"
          options={PROFILES.map((p) => ({ label: p.label, value: p.value.statement }))}
          onPick={(statement) => onChange({ ...value, statement })}
          disabled={disabled}
        />
        <div className="flex flex-wrap justify-between gap-2">
          <p className="text-xs text-muted-foreground">One line of plain keyboard characters. No double quotes and no angle brackets; use an apostrophe.</p>
          <Count value={value.statement.trim().length} range={limits.statement} />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Entries</p>
          <p className="text-xs text-muted-foreground">
            Name each counterparty or activity and say how you are related to it. At least {limits.entries[0]}, at most{" "}
            {limits.entries[1]}. A name made only of filler words (various, business, interests) is refused: it names nothing a
            reading could be made against.
          </p>
        </div>
        {value.entries.map((e, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-background/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Entry {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || value.entries.length <= limits.entries[0]}
                onClick={() => onChange({ ...value, entries: value.entries.filter((_, k) => k !== i) })}
                aria-label={`Remove entry ${i + 1}`}
              >
                <Trash2 /> Remove
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`entry-name-${i}`} className="text-xs">
                  What it is ({limits.entryName[0]} to {limits.entryName[1]} characters)
                </Label>
                <Input
                  id={`entry-name-${i}`}
                  value={e.name}
                  disabled={disabled}
                  onChange={(ev) => setEntry(i, { name: ev.target.value })}
                  placeholder="Pelican Press"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`entry-relation-${i}`} className="text-xs">
                  Your relation to it
                </Label>
                <select
                  id={`entry-relation-${i}`}
                  value={e.relation}
                  disabled={disabled}
                  onChange={(ev) => setEntry(i, { relation: ev.target.value })}
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
                >
                  {RELATIONS.map((r) => (
                    <option key={r.token} value={r.token}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`entry-detail-${i}`} className="text-xs">
                Anything further, in your own words (optional, up to {limits.entryDetail} characters
                {e.relation === RELATION_OTHER ? `; required here, at least ${limits.otherDetail}` : ""})
              </Label>
              <Input
                id={`entry-detail-${i}`}
                value={e.detail}
                disabled={disabled}
                onChange={(ev) => setEntry(i, { detail: ev.target.value })}
                placeholder="a print shop on Quay Street; I hold half of it"
              />
            </div>
            <Suggest label="Fill this entry" options={ENTRY_IDEAS} onPick={(idea) => setEntry(i, idea)} disabled={disabled} />
            <p className="text-[11px] text-muted-foreground">
              The contract will print this relation as: <span className="text-foreground">{RELATIONS.find((r) => r.token === e.relation)?.phrase}</span>.
            </p>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.entries.length >= limits.entries[1]}
          onClick={() => onChange({ ...value, entries: [...value.entries, { name: "", relation: "member_of", detail: "" }] })}
        >
          <Plus /> Add an entry
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Addresses you declare as your own (optional)</p>
          <p className="text-xs text-muted-foreground">
            Up to {limits.declared}. A spend that pays one of them is refused to you at once, with no model asked. The address you
            enrol from counts as declared without being listed. Declaring costs nothing and buys nothing except that refusal.
          </p>
        </div>
        {value.addresses.map((a, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={a}
              disabled={disabled}
              onChange={(ev) => setAddress(i, ev.target.value)}
              placeholder="0x followed by 40 hexadecimal characters"
              className="font-mono text-xs"
              aria-label={`Declared address ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={() => onChange({ ...value, addresses: value.addresses.filter((_, k) => k !== i) })}
              aria-label={`Remove declared address ${i + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || value.addresses.length >= limits.declared}
          onClick={() => onChange({ ...value, addresses: [...value.addresses, ""] })}
        >
          <Plus /> Declare an address
        </Button>
      </div>
    </div>
  );
}
