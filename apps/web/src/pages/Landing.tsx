import { usePageTitle } from "../router";
import { Bento } from "./landing/Bento";
import { Build } from "./landing/Build";
import { Destinations } from "./landing/Destinations";
import { Faq } from "./landing/Faq";
import { Features } from "./landing/Features";
import { FinalCta } from "./landing/FinalCta";
import { Hero } from "./landing/Hero";
import { Guides } from "./landing/Guides";
import { HowItWorks } from "./landing/HowItWorks";
import { LiveSection } from "../live/LiveSection";
import { SearchBar } from "./landing/SearchBar";
import { Stats } from "./landing/Stats";
import { Stories } from "./landing/Stories";
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
      <Guides />
      <Stories />
      <Stats />
      <HowItWorks />
      <Faq />
      <Build />
      <FinalCta />
    </>
  );
}
