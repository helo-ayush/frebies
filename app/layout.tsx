import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { SoundEffects } from "@/components/ui/sound";
import { ArcLinkProvider } from "@/components/ArcLinkProvider";
import "@/components/arc/foundation.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "frebies",
  title: "Frebies: every tool you need, mostly free",
  description:
    "A growing toolbox of file converters, image tools and PDF utilities. Free for everyday work, credits only for AI tools.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-accent="coral">
      <body className={`${inter.variable} ${interTight.variable} font-sans`}>
        <ArcLinkProvider>
          <SoundEffects>{children}</SoundEffects>
        </ArcLinkProvider>
      </body>
    </html>
  );
}
