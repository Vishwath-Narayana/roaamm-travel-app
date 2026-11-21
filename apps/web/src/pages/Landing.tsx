import { usePageTitle } from "../router";
import { Bento } from "./landing/Bento";
import { Destinations } from "./landing/Destinations";
import { Features } from "./landing/Features";
import { FinalCta } from "./landing/FinalCta";
import { Hero } from "./landing/Hero";
import { HowItWorks } from "./landing/HowItWorks";
import { LiveSection } from "../live/LiveSection";
import { SearchBar } from "./landing/SearchBar";
import { Stats } from "./landing/Stats";
import { TrustStrip } from "./landing/TrustStrip";

export function Landing() {
  usePageTitle("ROAAMM");
  return (
    <>
      <Hero />
      <SearchBar />
      <TrustStrip />
      <Destinations />
      <Bento />
      <div className="section container">
        <LiveSection />
      </div>
      <Features />
      <Stats />
      <HowItWorks />
      <FinalCta />
    </>
  );
}
