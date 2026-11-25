import type { Metadata } from "next";
import { DashboardIndex } from "@/components/dashboard/DashboardIndex";

export const metadata: Metadata = {
  title: "All tools | frebies",
  robots: { index: false, follow: true },
};

export default function DashboardPage() {
  return <DashboardIndex />;
}
