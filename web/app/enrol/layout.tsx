import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enrol",
  description: "File a disclosure of your own interests to join a desk, or amend the one you filed. An amendment counts only for spends posted after it.",
};

export default function EnrolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
