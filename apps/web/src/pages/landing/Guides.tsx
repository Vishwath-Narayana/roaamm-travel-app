import { useState, type CSSProperties } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { CheckIcon } from "../../components/icons";
import { avatarGradient } from "../../live/useTimeline";
import { Reveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Guides.css";

// Fictional guides with generated avatars. Rates are plausible local prices,
// shown as simulated profiles.
export const GUIDES = [
  {
    name: "Sofia Marques",
    city: "Lisbon",
    languages: ["Portuguese", "English", "Spanish"],
    rating: 4.9,
    tags: ["Alfama walks", "Food", "Viewpoints"],
    currency: "EUR",
    rate: 28,
  },
  {
    name: "Kenji Mori",
    city: "Kyoto",
    languages: ["Japanese", "English"],
    rating: 4.8,
    tags: ["Temples", "Tea houses", "Gion at dusk"],
    currency: "JPY",
    rate: 4500,
  },
  {
    name: "Linh Tran",
    city: "Hanoi",
    languages: ["Vietnamese", "English", "French"],
    rating: 4.9,
    tags: ["Street food", "Old Quarter", "Coffee"],
    currency: "VND",
    rate: 350000,
  },
  {
    name: "Mateo Quispe",
    city: "Cusco",
    languages: ["Spanish", "Quechua", "English"],
    rating: 4.7,
    tags: ["Sacred Valley", "Markets", "Altitude tips"],
    currency: "PEN",
    rate: 60,
  },
] as const;

/** One shared caption under the grid explains every disabled Book button. */
const BOOKING_NOTE_ID = "guides-booking-note";

export const MIN_HOURS = 1;
export const MAX_HOURS = 4;

/** "EUR 84", "VND 1,050,000": the currency code keeps it unambiguous. */
export function money(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
}

function GuideCard({ guide, index }: { guide: (typeof GUIDES)[number]; index: number }) {
  const [hours, setHours] = useState(2);
  const titleId = `guide-${index}-name`;
  return (
    <Reveal as="li" delay={index} className="guide" aria-labelledby={titleId} data-tilt data-glare>
      <div className="guide__top">
        <span
          className="guide__avatar"
          style={{ background: avatarGradient(guide.name) } as CSSProperties}
          aria-hidden="true"
        >
          {initials(guide.name)}
        </span>
        <div className="guide__who">
          <h3 id={titleId}>{guide.name}</h3>
          <p className="guide__city">{guide.city}</p>
        </div>
        <span className="guide__rating">
          <span aria-hidden="true">★ {guide.rating}</span>
          <span className="visually-hidden">Rated {guide.rating} out of 5</span>
        </span>
      </div>

      <Badge variant="verified">Licence checked</Badge>
      <p className="guide__langs">
        <span className="visually-hidden">Languages: </span>
        {guide.languages.join(" · ")}
      </p>
      <ul className="guide__tags" aria-label="Specialities">
        {guide.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <div className="guide__price">
        <p className="guide__rate">
          <span className="mono">{money(guide.currency, guide.rate)}</span>
          <span className="guide__per">/h</span>
        </p>
        <div className="stepper" role="group" aria-label={`Hours with ${guide.name}`}>
          <button
            type="button"
            aria-label="Fewer hours"
            disabled={hours <= MIN_HOURS}
            onClick={() => setHours((h) => Math.max(MIN_HOURS, h - 1))}
          >
            −
          </button>
          <span className="stepper__value" aria-hidden="true">
            {hours} h
          </span>
          <button
            type="button"
            aria-label="More hours"
            disabled={hours >= MAX_HOURS}
            onClick={() => setHours((h) => Math.min(MAX_HOURS, h + 1))}
          >
            +
          </button>
        </div>
        <output className="guide__total" aria-live="polite" data-testid={`total-${index}`}>
          {hours} {hours === 1 ? "hour" : "hours"} · Total{" "}
          <strong className="mono">{money(guide.currency, guide.rate * hours)}</strong>
        </output>
      </div>

      <Button disabled variant="secondary" className="guide__book" aria-describedby={BOOKING_NOTE_ID}>
        Book
      </Button>
    </Reveal>
  );
}

export function Guides() {
  return (
    <section id="guides" className="section cv-auto" aria-labelledby="guides-title" data-simulated-scope>
      <div className="container">
        <SectionHead
          className="guides__head"
          eyebrow="Local guides"
          id="guides-title"
          title={
            <>
              Guides by <span className="serif">the hour</span>
            </>
          }
          lead="Book a licensed local for the part of the trip you want: an afternoon in the old town, a morning at the market. Prices in local currency, shown before you book."
          aside={<Badge>Simulated profiles</Badge>}
        />
        <ul className="guides">
          {GUIDES.map((g, i) => (
            <GuideCard key={g.name} guide={g} index={i} />
          ))}
        </ul>
        <p id={BOOKING_NOTE_ID} className="guides__booking small">
          Booking opens in a later milestone.
        </p>
        <p className="guides__foot small">
          <CheckIcon size={14} strokeWidth={2.5} /> Every guide's licence is checked before they
          can take bookings. These four profiles are simulated.
        </p>
      </div>
    </section>
  );
}
