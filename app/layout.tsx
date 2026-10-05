import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const cormorant = localFont({ src: "../assets/cormorant-garamond-500.ttf", variable: "--font-cormorant", display: "swap" });
const pinyon = localFont({ src: "../assets/pinyon-script-400.ttf", variable: "--font-pinyon", display: "swap" });

export const metadata: Metadata = {
  title: "Studio Princess | Demo zakazivanje",
  description: "Demo stranica Studija Princess u Banjoj Luci: nokti, kosa, depilacija i solarijum.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#FDFBF7" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sr-Latn-BA" className={`${cormorant.variable} ${pinyon.variable}`}>
      <body>{children}</body>
    </html>
  );
}
