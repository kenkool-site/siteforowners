import type { Metadata } from "next";
import { Footer } from "../_components/Footer";
import { DemoLeadForm } from "./_components/DemoLeadForm";
import { DemoShowcase } from "./_components/DemoShowcase";

export const metadata: Metadata = {
  title: "Demo — SiteForOwners Beauty Website Portfolio",
  description:
    "A beauty-focused portfolio reel of customer-facing websites, booking flows, and owner tools from SiteForOwners.",
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "SiteForOwners Demo",
    description:
      "See beauty websites, booking flows, and owner dashboards built for appointment-based businesses.",
    url: "/demo",
  },
};

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#100b0b]">
      <DemoShowcase />
      <DemoLeadForm />
      <Footer />
    </main>
  );
}
