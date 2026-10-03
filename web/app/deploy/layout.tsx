import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deploy",
  description: "Deploy your own copy of the Recused contract from your wallet, from the same source this site serves, or point this browser at one.",
};

export default function DeployLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
