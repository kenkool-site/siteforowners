import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { HowItWorks } from "./_components/HowItWorks";
import { RightNow } from "./_components/RightNow";
import { CustomerView } from "./_components/CustomerView";
import { OwnerDashboardTour } from "./_components/OwnerDashboardTour";
import { WhatsIncluded } from "./_components/WhatsIncluded";
import { Pricing } from "./_components/Pricing";
import { FAQ } from "./_components/FAQ";
import { RequestSiteForm } from "./_components/RequestSiteForm";
import { FinalCTA } from "./_components/FinalCTA";
import { Footer } from "./_components/Footer";

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-white">
      <Nav />
      <Hero />
      <HowItWorks />
      <RightNow />
      <CustomerView />
      <OwnerDashboardTour />
      <WhatsIncluded />
      <Pricing />
      <FAQ />
      <RequestSiteForm />
      <FinalCTA />
      <Footer />
    </main>
  );
}
