import type { Metadata } from "next";
import { Nav } from "../_components/Nav";
import { Footer } from "../_components/Footer";
import { RequestSiteContent } from "./_components/RequestSiteContent";

export const metadata: Metadata = {
  title: "Request your website — SiteForOwners",
  description:
    "Send your business details and get a free, private website preview to review — no tech setup, no commitment.",
  alternates: {
    canonical: "/request-site",
  },
  openGraph: {
    title: "Request your website — SiteForOwners",
    description:
      "Send your business details and get a free, private website preview to review.",
    url: "/request-site",
  },
};

export default function RequestSitePage() {
  return (
    <main className="min-h-screen bg-warm-cream2">
      <Nav />
      <RequestSiteContent />
      <Footer />
    </main>
  );
}
