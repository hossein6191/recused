"use client";

// The full-screen menu: the panel wipes open across the page, the sections come in one after
// another, and the section under the pointer shows what it is for and what you can do there,
// step by step. Escape or the cross closes it. With reduced motion it simply fades.

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";

import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { GUIDES, HOME_GUIDE } from "@/lib/guides";
import { cn } from "@/lib/utils";

const CLIP = {
  closedInitial: "polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)",
  open: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)",
  closedFinal: "polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)",
};

// One entry per section, in the order a newcomer would walk them. The page of a single spend is
// reached from the desk, so it is not listed on its own.
const SECTIONS = [HOME_GUIDE, ...GUIDES.filter((g) => g.guide.key !== "spend")];

const noop = () => () => {};
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A label whose letters slide up one after another to show their twins underneath. */
function LinkHover({ label }: { label: string }) {
  return (
    <span className="group/link relative inline-block overflow-hidden align-middle leading-[1.1]">
      <span className="sr-only">{label}</span>
      {[...label].map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="relative inline-block whitespace-pre transition-transform duration-500 ease-[cubic-bezier(0.625,0.05,0,1)] group-hover/link:-translate-y-[1.2em] group-focus-visible/link:-translate-y-[1.2em]"
          style={{ textShadow: "0 1.2em currentColor", transitionDelay: `${i * 0.015}s` }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

const bar = "block h-0.5 w-5 bg-current transition-all duration-500 ease-in-out";

export function SectionsMenu() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const mounted = React.useSyncExternalStore(noop, () => true, () => false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const overlayRef = React.useRef<HTMLElement | null>(null);
  const linksRef = React.useRef<(HTMLButtonElement | null)[]>([]);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const tween = React.useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);

  const open = () => {
    const here = SECTIONS.findIndex((s) => (s.href === "/" ? pathname === "/" : pathname.startsWith(s.href)));
    setActive(here >= 0 ? here : 0);
    setIsOpen(true);
    tween.current?.kill();
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (reduced()) {
      gsap.set(overlay, { clipPath: CLIP.open, autoAlpha: 0 });
      gsap.set(linksRef.current, { y: 0, opacity: 1 });
      tween.current = gsap.to(overlay, { autoAlpha: 1, duration: 0.2 });
      return;
    }
    gsap.set(overlay, { clipPath: CLIP.closedInitial, autoAlpha: 1 });
    gsap.set(linksRef.current, { y: 30, opacity: 0 });
    tween.current = gsap
      .timeline()
      .to(overlay, { clipPath: CLIP.open, duration: 1.0, ease: "power4.inOut" })
      .to(linksRef.current, { y: 0, opacity: 1, duration: 0.7, ease: "power2.out", stagger: 0.07 }, "-=0.35");
  };

  const close = React.useCallback(() => {
    setIsOpen(false);
    tween.current?.kill();
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (reduced()) {
      tween.current = gsap.to(overlay, { autoAlpha: 0, duration: 0.2, onComplete: () => gsap.set(overlay, { clipPath: CLIP.closedInitial }) });
      return;
    }
    tween.current = gsap.to(overlay, { clipPath: CLIP.closedFinal, duration: 0.9, ease: "power4.inOut" });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, close]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const section = SECTIONS[active];

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Open the menu of sections"
        aria-expanded={isOpen}
        className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 text-xs font-medium backdrop-blur-sm transition-colors hover:bg-white/10"
      >
        <span className="flex flex-col gap-1">
          <span className={bar} />
          <span className={bar} />
        </span>
        Menu
      </button>
      {mounted
        ? createPortal(
            <nav
              ref={overlayRef}
              aria-hidden={!isOpen}
              aria-label="Sections of the site"
              style={{ clipPath: CLIP.closedInitial }}
              className={cn("fixed inset-0 z-[70] overflow-y-auto bg-[#08060f] text-white", isOpen ? "pointer-events-auto" : "pointer-events-none")}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(17,15,255,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(227,125,247,0.25),transparent_55%)]" />
              <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col gap-8 px-6 py-8 sm:px-10">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-[0.2em] text-white/60 uppercase">Recused · every section, step by step</p>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={close}
                    tabIndex={isOpen ? 0 : -1}
                    aria-label="Close the menu"
                    className="flex size-10 cursor-pointer flex-col items-center justify-center rounded-full border border-white/20 hover:bg-white/10"
                  >
                    <span className={cn(bar, "translate-y-[1px] rotate-45")} />
                    <span className={cn(bar, "-translate-y-[1px] -rotate-45")} />
                  </button>
                </div>
                <div className="grid flex-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
                  <div className="flex flex-col">
                    {SECTIONS.map((s, i) => (
                      <button
                        key={s.guide.key}
                        ref={(el) => {
                          linksRef.current[i] = el;
                        }}
                        type="button"
                        tabIndex={isOpen ? 0 : -1}
                        onMouseEnter={() => setActive(i)}
                        onFocus={() => setActive(i)}
                        onClick={() => go(s.href)}
                        className={cn(
                          "flex cursor-pointer items-baseline gap-4 py-1 text-left text-[9vw] leading-tight font-semibold tracking-tight transition-colors sm:text-5xl lg:text-6xl",
                          i === active ? "text-white" : "text-white/45 hover:text-white",
                        )}
                      >
                        <span className="w-6 shrink-0 font-mono text-xs text-white/40">{String(i + 1).padStart(2, "0")}</span>
                        <LinkHover label={s.guide.title} />
                      </button>
                    ))}
                  </div>
                  <div key={section.guide.key} className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-7">
                    <p className="text-xs font-semibold tracking-widest text-white/50 uppercase">Here you can</p>
                    <p className="text-base text-white/90 text-pretty">{section.guide.what}</p>
                    <ol className="space-y-2">
                      {section.guide.steps.map(([title, body], i) => (
                        <li key={title} className="flex gap-3">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-b from-brand to-brand-secondary text-xs font-semibold">
                            {i + 1}
                          </span>
                          <span className="min-w-0 text-sm">
                            <span className="block font-medium">{title}</span>
                            <span className="block text-white/60 text-pretty">{body}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <InteractiveHoverButton tabIndex={isOpen ? 0 : -1} onClick={() => go(section.href)}>
                      Open {section.guide.title}
                    </InteractiveHoverButton>
                  </div>
                </div>
              </div>
            </nav>,
            document.body,
          )
        : null}
    </>
  );
}
