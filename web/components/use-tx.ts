"use client";

import * as React from "react";

import { refusalReason, write, type Call, type TxStatus } from "@/lib/chain";
import { sentence } from "@/lib/words";

export type TxRun = {
  /** the tx being tracked, null when nothing is running; a new start() clears the old one first */
  hash: string | null;
  /** the call that produced `hash` */
  call: Call | null;
  /** the final status once TxRail reports done */
  final: TxStatus | null;
  /** an error thrown by write() itself (wallet refused, wrong chain) */
  error: string;
  sending: boolean;
  start: (call: Call) => Promise<string | null>;
  onDone: (s: TxStatus) => void;
  reset: () => void;
};

/**
 * One write at a time. The previous run's hash and result leave the screen the moment a new run starts,
 * so a stale explorer link never sits over a new transaction.
 */
export function useTx(onFinal?: (s: TxStatus, hash: string, call: Call) => void): TxRun {
  const [hash, setHash] = React.useState<string | null>(null);
  const [call, setCall] = React.useState<Call | null>(null);
  const [final, setFinal] = React.useState<TxStatus | null>(null);
  const [error, setError] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const running = React.useRef<{ hash: string; call: Call } | null>(null);
  const cb = React.useRef(onFinal);
  React.useEffect(() => {
    cb.current = onFinal;
  });

  const reset = React.useCallback(() => {
    running.current = null;
    setHash(null);
    setCall(null);
    setFinal(null);
    setError("");
    setSending(false);
  }, []);

  const start = React.useCallback(
    async (c: Call) => {
      reset();
      setSending(true);
      try {
        const h = await write(c);
        running.current = { hash: h, call: c };
        setHash(h);
        setCall(c);
        return h;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(cleanWalletError(msg));
        return null;
      } finally {
        setSending(false);
      }
    },
    [reset],
  );

  const onDone = React.useCallback((s: TxStatus) => {
    setFinal(s);
    const r = running.current;
    if (r) cb.current?.(s, r.hash, r.call);
  }, []);

  return { hash, call, final, error, sending, start, onDone, reset };
}

/** Wallet errors are long JSON; keep the sentence a person can act on. */
export function cleanWalletError(msg: string): string {
  if (!msg) return "The wallet returned an error.";
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "You cancelled the signature in the wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough test GEN. Use the wallet menu to get 10 test GEN.";
  const m = msg.match(/\[EXPECTED\]\s*([^"}\n]+)/);
  if (m) return sentence(m[1]);
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

/** True when the transaction finished and the contract did what was asked. */
export function succeeded(s: TxStatus | null): boolean {
  return !!s && s.status === "FINALIZED" && s.applied !== false && !s.undetermined && s.exec !== "ERROR" && s.result?.ok !== false;
}

/** A plain sentence for a tx that finished without doing what was asked; "" when it did. */
export function failureOf(s: TxStatus | null): string {
  if (!s) return "";
  if (s.undetermined) return "The validators split, so nothing was stored. Sending the same call again is safe.";
  if (s.status === "CANCELED") return "The network cancelled the transaction. Nothing was stored.";
  const reason = refusalReason(s);
  if (reason) return sentence(reason);
  if (s.result && s.result.ok === false) return "The contract refused this call.";
  if (s.exec === "ERROR") return "The contract refused this call.";
  if (s.applied === false) return "The validators did not accept this transaction. Nothing was stored.";
  return "";
}
