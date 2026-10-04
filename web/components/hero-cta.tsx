"use client";

import { useRouter } from "next/navigation";

import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

/** The landing page's main action: straight to the practice desk. */
export function HeroCta() {
  const router = useRouter();
  return <InteractiveHoverButton onClick={() => router.push("/practice")}>Try it yourself in ten minutes</InteractiveHoverButton>;
}
