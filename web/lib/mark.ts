// The Recused mark as an SVG string, for the generated images (app/opengraph-image.tsx and
// app/apple-icon.tsx). The same drawing as public/brand/mark.svg and components/brand/logo.tsx.

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="256" height="256"><defs><linearGradient id="g" x1="8" y1="58" x2="58" y2="8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5F5DFF"/><stop offset="0.55" stop-color="#9B6AF6"/><stop offset="1" stop-color="#E37DF7"/></linearGradient></defs><path d="M49.7 30.5A20 20 0 1 1 33.5 14.3" fill="none" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/><circle cx="51" cy="13" r="6" fill="#E37DF7"/></svg>`;

export const markDataUri = (): string => "data:image/svg+xml;base64," + Buffer.from(MARK_SVG).toString("base64");
