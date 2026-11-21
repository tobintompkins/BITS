import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";

import { DisplayPreferencesRoot } from "@/components/accessibility/display-preferences-root";
import { DISPLAY_PREFERENCES_BOOT_SCRIPT } from "@/lib/accessibility/display-preferences";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/Geist[wght].woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMono[wght].woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "BITS — Bring In The Sheaves",
  description: "Charitable giving management for churches and faith organizations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="bits-display-preferences"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: DISPLAY_PREFERENCES_BOOT_SCRIPT }}
        />
        <ClerkProvider>
          <DisplayPreferencesRoot />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
