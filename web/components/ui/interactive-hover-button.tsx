import React from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

/** The label slides out, a dot grows to fill the pill, and the label comes back with an arrow. */
const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(
  ({ text, children, className, ...props }, ref) => {
    const label = children ?? text ?? "Button";
    return (
      <button
        ref={ref}
        className={cn(
          "group relative inline-flex min-h-10 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/20 bg-background/60 px-6 py-2 text-center text-sm font-semibold backdrop-blur-sm disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <span className="inline-flex translate-x-1 items-center gap-2 pl-3 transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
          {label}
        </span>
        <div
          aria-hidden
          className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-white opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100"
        >
          <span className="inline-flex items-center gap-2">{label}</span>
          <ArrowRight className="size-4" />
        </div>
        <div className="absolute top-[40%] left-[7%] h-2 w-2 scale-[1] rounded-lg bg-brand transition-all duration-300 group-hover:top-[0%] group-hover:left-[0%] group-hover:h-full group-hover:w-full group-hover:scale-[1.8] group-hover:bg-brand"></div>
      </button>
    );
  },
);

InteractiveHoverButton.displayName = "InteractiveHoverButton";

export { InteractiveHoverButton };
