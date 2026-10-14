// The route's own browser title. A "use client" page cannot export metadata, so each route keeps
// this small server layout beside it; the template in app/layout.tsx adds the site name.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Desk",
  description: "One desk of the fund: its balance, its public registers, stake and hold, its members with their disclosures and public records, and its spends.",
};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
