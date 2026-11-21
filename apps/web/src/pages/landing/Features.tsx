import type { ReactNode } from "react";
import "../../components/Card.css";
import { CalendarIcon, CheckIcon, GuideIcon, PriceIcon, ShieldIcon } from "../../components/icons";
import { Photo } from "../../components/Photo";
import { Reveal } from "../../motion";
import "./Features.css";

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Meet on your dates",
    body: "See verified travellers whose trips overlap yours, city by city.",
    icon: <CalendarIcon strokeWidth={1.5} />,
  },
  {
    title: "Licensed local guides",
    body: "Book a licensed guide by the hour, only for the part of the trip you want.",
    icon: <GuideIcon strokeWidth={1.5} />,
  },
  {
    title: "Real local prices",
    body: "Guides set clear hourly rates in local currency, shown before you book.",
    icon: <PriceIcon strokeWidth={1.5} />,
  },
  {
    title: "Safety built in",
    body: "SOS, live location sharing and check-in timers, end-to-end encrypted.",
    icon: <ShieldIcon strokeWidth={1.5} />,
  },
];

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item}>
          <CheckIcon size={18} strokeWidth={2.25} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Features() {
  return (
    <section id="features" className="section cv-auto" aria-labelledby="features-title">
      <div className="container">
        <div className="split">
          <div className="split__text">
            <div className="section-head">
              <Reveal as="p" variant="fade" className="eyebrow">
                Features
              </Reveal>
              <Reveal as="h2" id="features-title" delay={1}>
                Built for travelling <span className="serif">alone</span>
              </Reveal>
              <Reveal as="p" className="lead" delay={2}>
                Everything a solo trip needs, in one place: people to meet, someone local to
                show you around, and a safety net that is always on.
              </Reveal>
            </div>
            <ul className="features-grid">
              {FEATURES.map((f, i) => (
                <Reveal as="li" key={f.title} delay={i} className="feature">
                  <span className="feature__icon">{f.icon}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal variant="scale" className="split__media">
            <Photo
              slot="feature-guide"
              alt="A traveller walking down a sunlit cobblestone alley in an old town"
              sizes="(min-width: 900px) 40vw, 92vw"
            />
            <span className="glass-pill glass-pill--dark split__chip">Walk it with a local</span>
          </Reveal>
        </div>

        <div className="spotlights">
          <Reveal as="section" id="safety" aria-labelledby="safety-title" className="card spotlight">
            <h3 id="safety-title">Safety, built in</h3>
            <CheckList
              items={[
                "SOS alerts your emergency contacts with your location.",
                "Share live location only with people you choose.",
                "A check-in timer escalates if you miss it.",
              ]}
            />
          </Reveal>
          <Reveal as="section" aria-labelledby="licence-title" delay={1} className="card spotlight">
            <h3 id="licence-title">Licensed local guides</h3>
            <CheckList
              items={[
                "Every guide's licence is checked before they can take bookings.",
                "Book by the hour, not by the package.",
                "Chat with your guide before you meet.",
              ]}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
