import localFont from "next/font/local";

/**
 * The only place the brand font is chosen.
 * Today: Figtree (SIL OFL), self-hosted. To switch to Avantt after licensing it from
 * Displaay, add the licensed files to app/fonts/ and change `src` and `variable` here.
 */
export const sans = localFont({
  src: "./fonts/Figtree.woff2",
  variable: "--font-loaded",
  display: "swap",
  preload: true,
  weight: "300 900",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"],
});
