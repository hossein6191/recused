"use client";

import * as React from "react";
import Link from "next/link";
import { NETWORK_ERROR, NO_REGISTER, RATE_LIMITED, cooldownRemainingMs } from "@/lib/chain";
import { RefreshCw, WifiOff, Hourglass, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { YourRegisterNotice } from "@/components/register-line";
import { cn } from "@/lib/utils";

/**
 * Runs `read` over `items` with at most `limit` in flight and returns every outcome in order.
 * Studio allows 30 reads a minute from one browser, so a page never sends one read per row in
 * a single burst, and one failed row never fails the rest.
 */
export async function readEach<T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  limit = 3,
): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await read(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/**
 * Seconds left on the shared rate-limit cooldown, ticking, and `onDone` once when it ends.
 * A cooldown that is already over fires `onDone` on the next tick.
 */
function useCooldown(onDone: () => void): number {
  const [left, setLeft] = React.useState(() => Math.ceil(cooldownRemainingMs() / 1000));
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  });
  React.useEffect(() => {
    let fired = false;
    const tick = () => {
      const ms = cooldownRemainingMs();
      setLeft(Math.ceil(ms / 1000));
      if (ms === 0 && !fired) {
        fired = true;
        clearInterval(timer);
        doneRef.current();
      }
    };
    const timer = setInterval(tick, 500);
    tick();
    return () => clearInterval(timer);
  }, []);
  return left;
}

/** The rate-limit message with its countdown; retries by itself when the cooldown ends. */
function RateLimited({ onRetry }: { onRetry: () => void }) {
  const left = useCooldown(onRetry);
  return (
    <>
      <p className="font-medium">Studio is rate-limiting this browser (30 reads a minute).</p>
      <p className="text-muted-foreground">
        This page retries by itself{left > 0 ? ` in ${left} s` : " in a moment"}. Nothing is wrong with the fund or with your wallet.
      </p>
    </>
  );
}

/** The state every page shows while the site has no register address. */
export function NoRegister({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn("flex flex-col gap-3 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <div>
        <p className="font-medium">No register is configured yet.</p>
        <p className="text-muted-foreground">
          This site has not been pointed at a deployed copy of the contract, so there is nothing to read. Deploying one takes a
          single signature and about a minute, and this browser reads it from then on.
        </p>
      </div>
      <Button asChild variant="cool" size="sm" className="shrink-0">
        <Link href="/deploy">
          <Rocket /> Deploy a register
        </Link>
      </Button>
    </div>
  );
}

/** A failed read is never "no data". Say the network did not answer and offer a retry. */
export function ReadError({
  onRetry,
  detail,
  className,
  compact,
}: {
  onRetry: () => void;
  detail?: string;
  className?: string;
  compact?: boolean;
}) {
  if (detail === NO_REGISTER) return <NoRegister className={className} />;
  const limited = detail === RATE_LIMITED;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between",
        limited ? "border-gold/40 bg-gold/10" : "border-breaks/40 bg-breaks/10",
        compact && "p-3 text-xs",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {limited ? <Hourglass className="mt-0.5 size-4 shrink-0 text-gold" /> : <WifiOff className="mt-0.5 size-4 shrink-0 text-breaks" />}
        <div>
          {limited ? (
            <RateLimited onRetry={onRetry} />
          ) : (
            <>
              <p className="font-medium">Could not reach the network.</p>
              <p className="text-muted-foreground">
                Studio did not answer after eight tries over about forty seconds. That says nothing about the fund: a read
                that failed is not an empty answer. A register deployed in the last minute or two often needs one more try.
                {/* The default detail is this heading in other words; only a more specific one is worth a line. */}
                {detail && detail !== NETWORK_ERROR ? (
                  <span className="block break-hash font-mono text-[11px] opacity-80">{detail}</span>
                ) : null}
              </p>
              {/* A register that is not a Recused contract fails every read the same way. */}
              <YourRegisterNotice className="mt-2" />
            </>
          )}
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw /> Retry now
      </Button>
    </div>
  );
}

/** Generic block skeleton: n lines of a card. */
export function BlockSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-xl border bg-card p-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-2/3" : i % 2 ? "w-full" : "w-5/6")} />
      ))}
    </div>
  );
}

/**
 * Wraps a read: skeleton while loading, error with retry when it failed, the empty state when it
 * answered with nothing, and then the children with the data.
 */
export function ReadBlock<T>({
  state,
  skeleton,
  children,
  emptyWhen,
  empty,
}: {
  state: { data: T | null; loading: boolean; error: string; retry: () => void };
  skeleton: React.ReactNode;
  children: (data: T) => React.ReactNode;
  /** when the read succeeded but there is nothing to show (a real empty list) */
  emptyWhen?: (data: T) => boolean;
  empty?: React.ReactNode;
}) {
  if (state.loading && state.data === null) return <>{skeleton}</>;
  if (state.error && state.data === null) return <ReadError onRetry={state.retry} detail={state.error} />;
  // The read finished and answered null (an id that does not exist): that is the empty state, not a skeleton.
  if (state.data === null) return <>{empty ?? skeleton}</>;
  return (
    <div className="space-y-3">
      {state.error ? <ReadError onRetry={state.retry} detail={state.error} compact /> : null}
      {emptyWhen && emptyWhen(state.data) ? empty : children(state.data)}
    </div>
  );
}
