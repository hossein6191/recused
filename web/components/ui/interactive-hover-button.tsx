import * as React from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

// The main call to action: the label slides away and comes back on a filled pill with an arrow.
// Takes children instead of a fixed text, and sizes to its content.

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: false };

const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, Props>(({ children, className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "group relative inline-flex h-11 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white/5 px-7 text-sm font-semibold text-foreground backdrop-blur-sm transition-transform duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="inline-flex items-center gap-2 pl-4 transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">{children}</span>
    <span className="absolute inset-0 z-10 flex translate-x-12 items-center justify-center gap-2 text-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
      {children}
      <ArrowRight className="size-4" />
    </span>
    <span className="absolute top-1/2 left-5 size-2 -translate-y-1/2 rounded-full bg-linear-to-b from-brand to-brand-secondary transition-all duration-300 group-hover:top-0 group-hover:left-0 group-hover:size-full group-hover:translate-y-0 group-hover:scale-[1.8]" />
  </button>
));
InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };
