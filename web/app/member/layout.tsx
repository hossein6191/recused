// The route's own browser title. A "use client" page cannot export metadata, so each route keeps
// this small server layout beside it; the template in app/layout.tsx adds the site name.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member",
  description:
    "One member of a desk: the public name they enrolled under, the stake they put up, the signatures it still answers for, and the public record of hidden conflicts proven and challenges survived.",
};

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
