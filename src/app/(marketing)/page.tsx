import { buildSiteForOwnersMetadata, siteForOwnersJsonLdScript } from "@/lib/siteforowners-seo";
import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { HowItWorks } from "./_components/HowItWorks";
import { RightNow } from "./_components/RightNow";
import { CustomerView } from "./_components/CustomerView";
import { OwnerDashboardTour } from "./_components/OwnerDashboardTour";
import { WhatsIncluded } from "./_components/WhatsIncluded";
import { Pricing } from "./_components/Pricing";
import { FAQ } from "./_components/FAQ";
import { FinalCTA } from "./_components/FinalCTA";
import { Footer } from "./_components/Footer";
import { NicheGuideLinks } from "./_components/NicheGuideLinks";

export const metadata = buildSiteForOwnersMetadata();

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: siteForOwnersJsonLdScript() }}
      />
      <Nav />
      <Hero />
      <HowItWorks />
      <RightNow />
      <CustomerView />
      <OwnerDashboardTour />
      <WhatsIncluded />
      <Pricing />
      <FAQ />
      <NicheGuideLinks />
      <FinalCTA />
      <Footer />
    </main>
  );
}
