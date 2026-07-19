import type { Metadata } from "next";
import { Noto_Sans, Archivo, Anton } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const body = Noto_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const display = Archivo({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

// Anton — the broadcast-style display face used for the Final hero wordmark and
// the scoreboard numerals (see the Final redesign). Body/other headings keep
// Noto Sans / Archivo.
const anton = Anton({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-anton",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WC 2026 Predictions",
  description: "Predict the FIFA World Cup 2026 group stage with your friends.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${anton.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
