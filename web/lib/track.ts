// What every practice track shares: the life of one step, the rule for when a step may be sent,
// and the stored shape every track's state starts from. No chain access and no React in here, so
// node runs it as it is (tests/unit/practice.test.mjs, tests/unit/catch.test.mjs).

/**
 * waiting   nothing sent yet (or about to be sent again after a round stored nothing)
 * checking  reading the chain to see whether the step already landed
 * signing   the key is signing and sending
 * onchain   sent; the validators have it
 * done      accepted, and the result is stored in this state
 * refused   the contract answered no and the page will not ask again by itself
 * stopped   the page could not send or follow the call; nothing is known to be wrong on chain
 */
export type Phase = "waiting" | "checking" | "signing" | "onchain" | "done" | "refused" | "stopped";
export const PHASES: Phase[] = ["waiting", "checking", "signing", "onchain", "done", "refused", "stopped"];

export type ActionState = {
  phase: Phase;
  /** the transaction being followed, or the one that did the step; "" when none */
  hash: string;
  /** a transaction of this step that stored nothing or was refused, kept for its explorer link */
  last: string;
  /** when a send began (ms); kept until its hash is stored, so a reload can tell a call may be in flight */
  markedAt: number;
  /** done, and found on the chain rather than sent in this sitting */
  found: boolean;
  /** done without having been sent: there was no time left, or no need */
  skipped: boolean;
  /** the refusal, the error, or what the last round did */
  note: string;
  tries: number;
  /** not to be sent again before this moment (ms) */
  notBefore: number;
};

export const blankAction = (): ActionState => ({ phase: "waiting", hash: "", last: "", markedAt: 0, found: false, skipped: false, note: "", tries: 0, notBefore: 0 });

export const isBusy = (p: Phase): boolean => p === "checking" || p === "signing" || p === "onchain";

/** The fields every track's state has; the engine (lib/track-engine.ts) reads nothing else of it. */
export type TrackState = {
  v: number;
  /** the register this practice desk lives on, lowercase */
  register: string;
  /** when the visitor pressed the button (ms); 0 until then */
  startedAt: number;
  /** the page-held private keys; throwaway, test GEN only */
  keys: Record<string, string>;
  addresses: Record<string, string>;
  desk: string;
  /** the visitor's address, fixed when their first step on this desk lands */
  visitor: string;
  actions: Record<string, ActionState>;
};

/** How long a call that may have left the browser is waited for before it is sent again. */
export const MARK_WAIT_MS = 45_000;

/**
 * What to do with an action before anything is sent.
 *   follow     a transaction of ours exists: follow it, never send
 *   wait       a send began and its hash was lost (the page closed): keep reading the chain
 *   read       read the chain once; send only if the step is not there
 */
export function plan(a: ActionState, nowMs: number): "follow" | "wait" | "read" {
  if (a.hash) return "follow";
  if (a.markedAt > 0 && nowMs - a.markedAt < MARK_WAIT_MS) return "wait";
  return "read";
}

export const KEY_RE = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS_RE = /^0x[0-9a-f]{40}$/;
export const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
export const DESK_RE = /^D[1-9]\d{0,8}$/;

/**
 * The stored steps of a track, each made safe: only an outcome survives a reload; anything that
 * was in motion is looked at again, with its hash and its mark kept so it is followed, never resent.
 */
export function parseActions(raw: unknown, ids: readonly string[]): Record<string, ActionState> {
  const out: Record<string, ActionState> = {};
  for (const id of ids) {
    const a = raw && typeof raw === "object" ? (raw as Record<string, Partial<ActionState>>)[id] : undefined;
    if (!a || typeof a !== "object") {
      out[id] = blankAction();
      continue;
    }
    const phase = PHASES.includes(a.phase as Phase) ? (a.phase as Phase) : "waiting";
    out[id] = {
      phase: phase === "done" || phase === "refused" || phase === "stopped" ? phase : "waiting",
      hash: typeof a.hash === "string" && HASH_RE.test(a.hash) ? a.hash : "",
      last: typeof a.last === "string" && HASH_RE.test(a.last) ? a.last : "",
      markedAt: Number(a.markedAt) > 0 ? Number(a.markedAt) : 0,
      found: !!a.found,
      skipped: !!a.skipped,
      note: typeof a.note === "string" ? a.note : "",
      tries: Number(a.tries) > 0 ? Number(a.tries) : 0,
      notBefore: Number(a.notBefore) > 0 ? Number(a.notBefore) : 0,
    };
  }
  return out;
}

/** Every key and address of a stored track, checked; null when one of them cannot be trusted. */
export function parseKeys(o: { keys?: unknown; addresses?: unknown }, names: readonly string[]): { keys: Record<string, string>; addresses: Record<string, string> } | null {
  const keys = (o.keys ?? {}) as Record<string, unknown>;
  const addresses = (o.addresses ?? {}) as Record<string, unknown>;
  const k: Record<string, string> = {};
  const a: Record<string, string> = {};
  for (const n of names) {
    if (!KEY_RE.test(String(keys[n] ?? "")) || !ADDRESS_RE.test(String(addresses[n] ?? ""))) return null;
    k[n] = String(keys[n]);
    a[n] = String(addresses[n]);
  }
  return { keys: k, addresses: a };
}

/**
 * The page-held actions that may be worked on now, in the order they are started. The visitor's
 * own steps are never in this list: they wait for the visitor's click.
 */
export function heldNext(
  s: TrackState,
  ids: readonly string[],
  isVisitor: (id: string) => boolean,
  blocked: (id: string) => string,
  nowMs: number,
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (isVisitor(id)) continue;
    const a = s.actions[id];
    if (a.phase === "done" || a.phase === "refused" || a.phase === "stopped") continue;
    if (a.notBefore > nowMs) continue;
    if (blocked(id)) continue;
    out.push(id);
  }
  return out;
}
