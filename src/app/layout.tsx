import type { Metadata } from "next";
import "./globals.css";
import { BootScript } from "@/components/BootScript";
import { SplashMarkup } from "@/components/Splash";

export const metadata: Metadata = {
  title: "DevTrack",
  description: "Personal developer analytics for your own codebases.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning is required, not cosmetic: BootScript sets
    // data-theme on this element before React hydrates, and React would
    // otherwise report the attribute it did not render as a mismatch.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <BootScript />
      </head>
      <body className="min-h-full flex flex-col">
        <SplashMarkup />
        {children}
      </body>
    </html>
  );
}
