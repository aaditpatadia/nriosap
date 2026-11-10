import { Manrope } from "next/font/google";

/**
 * The only place the brand font is chosen.
 * Today: Manrope (SIL Open Font License). Next.js downloads it at build time and serves it
 * from our own domain, so visitors never call Google. To change the font, change it here only.
 */
export const sans = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-loaded",
  display: "swap",
  preload: true,
  weight: ["300", "400", "500", "600", "700", "800"],
  adjustFontFallback: true,
  fallback: ["system-ui", "Segoe UI", "Roboto", "Noto Sans", "sans-serif"],
});
