import type { ReactNode } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { CalendarIcon, CheckIcon, GuideIcon, PriceIcon, ShieldIcon } from "../components/icons";
import { usePageTitle } from "../router";
import "./Landing.css";

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Meet on your dates",
    body: "See verified travellers whose trips overlap yours, city by city.",
    icon: <CalendarIcon />,
  },
  {
    title: "Licensed local guides",
    body: "Book a licensed guide by the hour, only for the part of the trip you want.",
    icon: <GuideIcon />,
  },
  {
    title: "Real local prices",
    body: "Guides set clear hourly rates in local currency, shown before you book.",
    icon: <PriceIcon />,
  },
  {
    title: "Safety built in",
    body: "SOS, live location sharing and check-in timers, end-to-end encrypted.",
    icon: <ShieldIcon />,
  },
];

// Not real numbers: always shown with the "Simulated data" badge.
const STATS = [
  { value: "212k", label: "travellers" },
  { value: "1,326", label: "guides" },
  { value: "41", label: "countries" },
];

const STEPS = [
  { title: "Verify", body: "Confirm your ID once. Everyone you meet has done the same." },
  { title: "Match or book", body: "Find travellers on your dates, or book a local guide by the hour." },
  {
    title: "Travel with safety tools",
    body: "SOS, live location and check-in timers stay one tap away.",
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

export function Landing() {
  usePageTitle("ROAAMM");
  return (
    <>
      <section className="container hero-wrap" aria-labelledby="hero-title">
        <div className="hero">
          <div className="hero__copy">
            <Badge variant="verified">ID-verified travellers only</Badge>
            <h1 id="hero-title">Travel solo. Never alone.</h1>
            <p className="hero__lead">
              Meet ID-verified solo travellers on your dates, book licensed local guides by the
              hour, and keep safety tools close for the whole trip.
            </p>
            <div className="hero__actions">
              <Button href="/demo" size="lg">
                Try demo
              </Button>
              <Button href="#how-it-works" variant="secondary" size="lg">
                How it works
              </Button>
            </div>
          </div>
          <div
            className="hero__media"
            role="img"
            aria-label="Photo placeholder: a traveller exploring a city. Real photos arrive with the seed data."
          />
        </div>
      </section>

      <section id="features" className="container section" aria-labelledby="features-title">
        <h2 id="features-title">Built for travelling alone</h2>
        <ul className="features">
          {FEATURES.map((f) => (
            <Card as="li" key={f.title} className="feature">
              <span className="feature__icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Card>
          ))}
        </ul>
      </section>

      <div className="container section spotlights">
        <Card as="section" id="safety" aria-labelledby="safety-title" className="spotlight">
          <h2 id="safety-title">Safety, built in</h2>
          <CheckList
            items={[
              "SOS alerts your emergency contacts with your location.",
              "Share live location only with people you choose.",
              "A check-in timer escalates if you miss it.",
            ]}
          />
        </Card>
        <Card as="section" id="guides" aria-labelledby="guides-title" className="spotlight">
          <h2 id="guides-title">Licensed local guides</h2>
          <CheckList
            items={[
              "Every guide's licence is checked before they can take bookings.",
              "Book by the hour, not by the package.",
              "Chat with your guide before you meet.",
            ]}
          />
        </Card>
      </div>

      <section className="container section" aria-labelledby="stats-title">
        <div className="stats__head">
          <h2 id="stats-title">ROAAMM in numbers</h2>
          <Badge>Simulated data</Badge>
        </div>
        <dl className="stats">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <dt>{s.label}</dt>
              <dd className="mono">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="how-it-works" className="container section" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step__num mono" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container section" aria-labelledby="cta-title">
        <Card elevated className="cta">
          <h2 id="cta-title">See it for yourself</h2>
          <p>Explore sample traveller, guide and admin views.</p>
          <Button href="/demo" size="lg">
            Try demo
          </Button>
        </Card>
      </section>
    </>
  );
}
