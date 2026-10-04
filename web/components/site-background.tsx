// The page background: a faint ruled grid that fades out below the fold, and two slow lights that
// drift behind it. It is CSS only, so it costs nothing when the tab is hidden, and a visitor who
// asks for reduced motion gets it standing still (see the .bg-* rules in app/globals.css).

export function SiteBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#07080c]">
      <div className="bg-light bg-light-a" />
      <div className="bg-light bg-light-b" />
      <div className="bg-ruled absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(7,8,12,0.9)_100%)]" />
    </div>
  );
}
