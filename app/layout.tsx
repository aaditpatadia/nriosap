import type { Metadata, Viewport } from "next";
import "./globals.css";
import { sans } from "./fonts";
import { MotionProvider } from "@/components/MotionProvider";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: { default: "Ally: your personal operations platform for life back home", template: "%s | Ally" },
  description:
    "From property and paperwork to family responsibilities and everyday tasks, Ally helps you organise and get things done back home in India. You see everything. You approve everything.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0d141c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable} data-text="normal">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:p-3">Skip to content</a>
        <MotionProvider>{children}<Toaster /></MotionProvider>
      </body>
    </html>
  );
}
