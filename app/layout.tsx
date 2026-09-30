import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { DisplayPreferencesRoot } from "@/components/accessibility/display-preferences-root";
import { DISPLAY_PREFERENCES_BOOT_SCRIPT } from "@/lib/accessibility/display-preferences";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: DISPLAY_PREFERENCES_BOOT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <DisplayPreferencesRoot />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
