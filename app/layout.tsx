import type { Metadata, Viewport } from "next";
import "./globals.css";
import { sans } from "./fonts";
import { MotionProvider } from "@/components/MotionProvider";

export const metadata: Metadata = {
  title: { default: "Ally: your family's India desk", template: "%s | Ally" },
  description:
    "A named person and a careful assistant look after your parents' paperwork, health insurance claims, bills and errands in India. You see everything. You approve everything.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7ef" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} data-text="normal">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">Skip to content</a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
