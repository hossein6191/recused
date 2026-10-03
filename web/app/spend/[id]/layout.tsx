// The route's own browser title. The id comes from the URL, so the tab is titled from the route
// alone: no chain read, and a made-up id never reaches the title.
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = /^(D[1-9]\d{0,8})[-:_]S?([1-9]\d{0,8})$/i.exec(decodeURIComponent(id));
  return {
    title: m ? `Spend S${m[2]} of ${m[1].toUpperCase()}` : "Spend",
    description: "One spend: the document the contract built and judged, who identified the payee, and every countersignature or recusal with its stored pair.",
  };
}

export default function SpendLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
