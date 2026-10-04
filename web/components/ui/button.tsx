"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { cn } from "@/lib/utils";

const candy =
  "border-[0.5px] border-white/25 bg-linear-to-b from-brand to-brand-secondary text-white shadow-md shadow-black/20 ring-1 ring-(--ring-color) [--ring-color:color-mix(in_oklab,var(--color-foreground)_15%,var(--color-brand))] hover:brightness-110 [&_svg]:drop-shadow-sm";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[transform,background-color,filter] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: candy,
        cool: candy,
        destructive:
          "bg-linear-to-b from-[#FD4B4E] to-destructive text-white shadow-[0px_1px_2px_rgba(0,0,0,0.4),0px_0px_0px_1px_#F61418,inset_0px_0.75px_0px_rgba(255,255,255,0.2)] hover:brightness-110",
        outline: "border border-white/15 bg-white/5 backdrop-blur-sm hover:border-white/25 hover:bg-white/10",
        secondary: "bg-white/10 text-foreground hover:bg-white/15",
        ghost: "hover:bg-white/8 hover:text-foreground hover:shadow-custom",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    // The main action of a page ("cool") is the interactive hover button; a link styled as one keeps
    // the plain filled pill, because the hover button needs to own its children.
    if (variant === "cool" && !asChild) {
      return <InteractiveHoverButton ref={ref} className={cn(size === "sm" ? "min-h-8 px-4 py-1 text-xs" : size === "lg" ? "min-h-11 px-8" : "", className)} {...props} />;
    }
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
