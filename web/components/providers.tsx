"use client";

import * as React from "react";

import { WalletProvider } from "@/components/wallet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster position="bottom-center" theme="dark" />
      </TooltipProvider>
    </WalletProvider>
  );
}
