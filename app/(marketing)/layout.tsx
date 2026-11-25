import { Anybody, Host_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./landing.css";

/** Wide, squared display face. The width axis is what makes it read as signage. */
const wide = Anybody({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-wide",
  display: "swap",
});

const host = Host_Grotesk({
  subsets: ["latin"],
  variable: "--font-host",
  display: "swap",
});

/** The landing page has its own type and tokens, so nothing here reaches the workbench. */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <div className={`lp ${wide.variable} ${host.variable}`}>{children}</div>;
}
