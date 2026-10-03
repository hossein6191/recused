"use client";

import * as React from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Action, Actions } from "@/components/ui/actions";
import { addressUrl, txUrl } from "@/lib/chain";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CopyAction({ value, what = "Copied" }: { value: string; what?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <Action
      tooltip="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success(what);
          setTimeout(() => setDone(false), 1200);
        } catch {
          toast.error("Could not copy");
        }
      }}
    >
      {done ? <Check className="text-keeps" /> : <Copy />}
    </Action>
  );
}

/** A short address with copy + explorer actions. */
export function Address({
  value,
  label,
  className,
  mono = true,
  head = 6,
  tail = 4,
}: {
  value: string;
  label?: string;
  className?: string;
  mono?: boolean;
  head?: number;
  tail?: number;
}) {
  if (!value) return <span className={cn("text-muted-foreground", className)}>none</span>;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {label ? <span className="mr-1 text-muted-foreground">{label}</span> : null}
      <span className={cn(mono && "font-mono")} title={value}>
        {short(value, head, tail)}
      </span>
      <Actions className="ml-0.5">
        <CopyAction value={value} what="Address copied" />
        <Action tooltip="Open in the explorer" asChild>
          <a href={addressUrl(value)} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Action>
      </Actions>
    </span>
  );
}

/** A tx hash with an explorer link. */
export function TxLink({ hash, className, label }: { hash: string; className?: string; label?: string }) {
  if (!hash) return null;
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-4 hover:underline", className)}
      title={hash}
    >
      {label ?? short(hash, 10, 6)}
      <ExternalLink className="size-3" />
    </a>
  );
}
