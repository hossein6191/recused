import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post a spend",
  description: "Post a spend for two countersignatures: a payee, an amount, a description, and the notice and approval windows.",
};

export default function NewSpendLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
