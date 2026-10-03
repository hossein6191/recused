import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ledger",
  description: "Every spend and every recusal of a desk, with the pair of characters each reading stored. Readable with no wallet.",
};

export default function LedgerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
