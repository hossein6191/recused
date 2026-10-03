"use client";

// Transaction progress rail: PENDING, PROPOSING, COMMITTING, REVEALING, ACCEPTED, FINALIZED,
// with validator vote tiles. Pages use exactly this surface: TxRail (props) and useTxStatus.
//
// FINALIZED does not mean the state changed: a judged call whose validators split finalizes
// too, with nothing stored. The rail reads the tally, not the status, and says so plainly.
// It also never prints the contract's raw return: a refusal is shown as a sentence.

import * as React from "react";
import { invalidateReads, isMock, movesMoney, txStatus, txUrl, type TxStatus } from "@/lib/chain";
import { STAGES } from "@/lib/rpc";
import { useWallet } from "@/components/wallet";
import { failureOf } from "@/components/use-tx";

export type TxRailProps = {
  hash: string;
  /** what the tx does, e.g. "Countersigning S3" */
  label?: string;
  /** called once when the tx reaches FINALIZED (or CANCELED / undetermined) with the final status */
  onDone?: (status: TxStatus) => void;
  /** show validator tiles (true for judged calls) */
  showVotes?: boolean;
  className?: string;
};

/** The in-memory contract of mock mode answers at once, so its rail moves faster. */
const POLL_MS = isMock ? 800 : 3000;
/** Stages a split round did reach: it ran to the reveal, and then no majority formed. */
const SPLIT_STAGES = 4;

const isFinal = (s: TxStatus) =>
  s.undetermined || s.status === "FINALIZED" || s.status === "CANCELED" || s.status === "UNDETERMINED";

/** Polls txStatus(hash) every 3 s until it is final. Exposes the latest status. */
export function useTxStatus(hash: string | null): TxStatus | null {
  // The status is stored with the hash it belongs to, so a new hash shows nothing from the
  // previous run (no stale explorer link or verdict under a fresh transaction).
  const [latest, setLatest] = React.useState<{ hash: string; status: TxStatus } | null>(null);
  React.useEffect(() => {
    if (!hash) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const s = await txStatus(hash);
        if (stopped) return;
        setLatest({ hash, status: s });
        if (isFinal(s)) return;
      } catch {
        /* a dropped poll is not a failed transaction; the next one may answer */
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [hash]);
  return latest && latest.hash === hash ? latest.status : null;
}

export function TxRail({ hash, label, onDone, showVotes, className }: TxRailProps) {
  const status = useTxStatus(hash);
  const wallet = useWallet();
  const doneFor = React.useRef<string | null>(null);
  // The latest callbacks live in refs, updated in an effect, so onDone fires exactly once
  // per hash even when the page re-renders with a new closure while the tx is still running.
  const onDoneRef = React.useRef(onDone);
  const refreshRef = React.useRef(wallet.refreshBalance);
  const watchRef = React.useRef(wallet.watchBalance);
  React.useEffect(() => {
    onDoneRef.current = onDone;
    refreshRef.current = wallet.refreshBalance;
    watchRef.current = wallet.watchBalance;
  }, [onDone, wallet.refreshBalance, wallet.watchBalance]);

  React.useEffect(() => {
    if (!status || !isFinal(status)) return;
    if (doneFor.current === hash) return;
    doneFor.current = hash;
    // The cached views are stale the moment the chain moved: drop them before the page
    // re-reads in onDone, so the refresh is a live read and not the 30 s cache.
    invalidateReads();
    // A transfer lands a few seconds after FINALIZED, so one read here would show the old
    // number: when this call moves GEN, the balance is re-read until it changes.
    if (movesMoney(status)) watchRef.current();
    else void refreshRef.current();
    onDoneRef.current?.(status);
  }, [status, hash]);

  const stageIndex = status ? STAGES.indexOf(status.status) : -1;
  const final = status ? isFinal(status) : false;
  const canceled = status?.status === "CANCELED";
  const split = !!status?.undetermined;
  const applied = !!status && status.status === "FINALIZED" && status.applied === true;
  const refused = applied && (status?.exec === "ERROR" || status?.result?.ok === false);
  const votes = status?.votes ?? { agree: 0, disagree: 0, idle: 0 };
  const total = votes.agree + votes.disagree + votes.idle;
  const tileCount = Math.max(5, total);

  return (
    <div
      className={
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-sm " + (className ?? "")
      }
      data-tx={hash}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{label ?? "Transaction"}</p>
        <a
          href={txUrl(hash)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {hash.slice(0, 10)}…{hash.slice(-6)} · explorer
        </a>
      </div>

      <ol className="flex flex-wrap gap-1.5" aria-label="consensus stages">
        {/* A split round is drawn as what happened: the validators voted, and then no
            majority, rather than a green "accepted" over a result nothing stored. */}
        {(split ? STAGES.slice(0, SPLIT_STAGES) : STAGES).map((stage, i) => {
          const reached = split ? true : final && !canceled ? true : i <= stageIndex;
          const current = !final && i === stageIndex;
          return (
            <li
              key={stage}
              aria-current={current ? "step" : undefined}
              className={
                "rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide " +
                (canceled && stage === "FINALIZED"
                  ? "border-rose-400/40 text-rose-300"
                  : reached
                    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                    : current
                      ? "animate-pulse border-primary/50 text-foreground"
                      : "border-border text-muted-foreground")
              }
            >
              {stage.toLowerCase()}
            </li>
          );
        })}
        {split && (
          <li className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-200">
            no majority
          </li>
        )}
      </ol>

      {showVotes && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5" aria-label="validator votes">
            {Array.from({ length: tileCount }, (_, i) => {
              const kind = i < votes.agree ? "agree" : i < votes.agree + votes.disagree ? "disagree" : "idle";
              return (
                <span
                  key={i}
                  title={kind}
                  className={
                    "h-6 flex-1 rounded-md border text-center text-[10px] leading-6 " +
                    (kind === "agree"
                      ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-100"
                      : kind === "disagree"
                        ? "border-rose-400/50 bg-rose-400/20 text-rose-100"
                        : total === 0
                          ? "border-border bg-muted/40 text-muted-foreground"
                          : "border-border bg-muted text-muted-foreground")
                  }
                >
                  {total === 0 ? "" : kind}
                </span>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? "Waiting for the validators…"
              : `${votes.agree} agree · ${votes.disagree} disagree · ${votes.idle} idle`}
          </p>
          {total > 0 && (
            <p className="text-[11px] text-muted-foreground">
              idle = this validator did not vote in the round; the majority of votes decides.
            </p>
          )}
        </div>
      )}

      <div className="text-sm">
        {!status && <p className="text-muted-foreground">Sent. Waiting for the network…</p>}
        {status && !final && (
          <p className="text-muted-foreground">
            {status.status === "UNKNOWN"
              ? "The network has not listed this transaction yet. It usually appears within a few seconds."
              : showVotes
                ? "The validators are each asking their own model both branches of the question. This usually takes one to two minutes; the page moves on by itself."
                : "The validators are checking the call. This usually takes under a minute; the page moves on by itself."}
          </p>
        )}
        {canceled && (
          <p className="text-rose-300">The network cancelled this transaction. Nothing was stored.</p>
        )}
        {split && !canceled && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
            <p className="font-medium">The validators split, nothing was stored.</p>
            <p className="mt-1 text-xs opacity-90">
              Nothing was applied and no attempt was spent. Pressing the same button again sends the same call; that is safe.
            </p>
          </div>
        )}
        {applied && !split && !refused && (
          <div className="flex flex-col gap-1">
            <p className="text-emerald-200">Finalized. The validators agreed and the result is stored.</p>
            {movesMoney(status) && (
              <p className="text-xs text-muted-foreground">
                Money moved by this call lands a few seconds after finalization; balances are re-read every 3 s until they move.
              </p>
            )}
          </div>
        )}
        {refused && (
          <div className="flex flex-col gap-1">
            <p className="text-amber-200">Finalized. The contract answered with a refusal:</p>
            <p className="text-foreground">{failureOf(status)}</p>
            {status?.result && "returned" in status.result && (
              <p className="text-xs text-muted-foreground">
                What was sent with the call was returned in the same transaction; it lands a few seconds after finalization.
              </p>
            )}
          </div>
        )}
        {status && status.status === "FINALIZED" && status.applied === null && !split && (
          <p className="text-muted-foreground">Finalized; the vote tally is not available yet.</p>
        )}
      </div>
    </div>
  );
}
