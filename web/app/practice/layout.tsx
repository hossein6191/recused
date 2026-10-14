// The route's own browser title. A "use client" page cannot export metadata, so each route keeps
// this small server layout beside it; the template in app/layout.tsx adds the site name.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Practice desk",
  description:
    "See the whole of Recused alone: the page sets up a desk and plays the other members. Be read by the validators and watch the fund pay after a short hold, or catch a member who hid a directorship of the payee with a public register page and be paid from their stake.",
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
