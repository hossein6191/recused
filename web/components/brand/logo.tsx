// The Recused mark and wordmark.
// The mark is an open ring with one dot standing just outside the gap: the members who carry a
// spend, and the one who steps aside. It is drawn in GenLayer's own gradient and stays legible
// in a single colour at favicon size.
import * as React from "react";

export const BRAND_FROM = "#5F5DFF";
export const BRAND_MID = "#9B6AF6";
export const BRAND_TO = "#E37DF7";

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="8" y1="58" x2="58" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={BRAND_FROM} />
          <stop offset="0.55" stopColor={BRAND_MID} />
          <stop offset="1" stopColor={BRAND_TO} />
        </linearGradient>
      </defs>
      <path d="M49.7 30.5A20 20 0 1 1 33.5 14.3" fill="none" stroke={`url(#${id})`} strokeWidth="8" strokeLinecap="round" />
      <circle cx="51" cy="13" r="6" fill={BRAND_TO} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 9, lineHeight: 1 }}>
      <LogoMark />
      <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.02em", color: "currentColor" }}>Recused</span>
    </span>
  );
}
