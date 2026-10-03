// Display helpers. Pure functions, no React.

const ATTO = 10n ** 18n;

/** "1.2 GEN" from an atto amount (string, bigint or number). Trims trailing zeros, keeps up to 4 decimals. */
export function gen(atto: string | bigint | number | null | undefined, unit = " GEN"): string {
  if (atto === null || atto === undefined || atto === "") return "0" + unit;
  let v: bigint;
  try {
    v = typeof atto === "bigint" ? atto : BigInt(String(atto).trim());
  } catch {
    return "?" + unit;
  }
  const neg = v < 0n;
  if (neg) v = -v;
  const whole = v / ATTO;
  const frac = v % ATTO;
  let out = whole.toString();
  if (frac > 0n) {
    // four decimals, rounded down, then trimmed
    const f = (frac / 10n ** 14n).toString().padStart(4, "0").replace(/0+$/, "");
    if (f) out += "." + f;
    else if (whole === 0n) out = "<0.0001";
  }
  return (neg ? "-" : "") + out + unit;
}

/** GEN to atto as a bigint. Accepts "1", "0.5", "1.25". Throws on junk. */
export function toAtto(genText: string): bigint {
  const t = genText.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) throw new Error("Enter an amount like 0.5 or 12");
  const [w, f = ""] = t.split(".");
  return BigInt(w) * ATTO + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/** 0x1234...abcd */
export function short(address: string | null | undefined, head = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return address.slice(0, head) + "…" + address.slice(-tail);
}

/** "4 min 12 s", "2 h 5 min", "3 d 4 h" from a number of seconds; "0 s" at or below zero. */
export function span(seconds: number): string {
  const left = Math.max(0, Math.floor(seconds));
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

/** "5 minutes", "2 hours", "3 days" from a window in minutes. */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  if (minutes < 1440) {
    const h = Math.round((minutes / 60) * 10) / 10;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  const d = Math.round((minutes / 1440) * 10) / 10;
  return d === 1 ? "1 day" : `${d} days`;
}

/** "2 Oct 2026, 21:40" in the reader's own zone, from chain seconds; "" for zero or junk. */
export function when(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(seconds * 1000));
}

/** "21:40:05" in the reader's own zone, from chain seconds. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(
    new Date(seconds * 1000),
  );
}

/** "3 min ago", "2 h ago", "4 days ago"; "just now" under a minute. */
export function ago(seconds: number, nowSeconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const s = Math.max(0, Math.floor(nowSeconds - seconds));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** "one", "two" ... for small counts in running text. */
export const countWord = (n: number): string =>
  ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? String(n);
