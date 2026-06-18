import type { Metadata, Viewport } from "next";
import { Assistant, Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const assistant = Assistant({ subsets: ["latin", "hebrew"], variable: "--font-sans" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-headline", weight: ["400","600","700","800"] });

export const metadata: Metadata = {
  title: {
    default: "ShiftSync",
    template: "%s | ShiftSync",
  },
  description: "ניהול משמרות אוטומטי לעסקים קטנים ובינוניים",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ShiftSync",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className={`${assistant.variable} ${manrope.variable} font-sans h-full`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
