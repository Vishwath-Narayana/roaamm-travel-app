import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Photo } from "../../components/Photo";
import type { CSSProperties } from "react";
import { Reveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Bento.css";

// Not real numbers: shown with the "Simulated data" label.
const METERS = [
  { label: "Profiles ID-verified", value: 100 },
  { label: "Replies within a day", value: 84 },
  { label: "Trips with a local guide", value: 36 },
];

function DotMeter({ label, value, index }: { label: string; value: number; index: number }) {
  const filled = Math.round(value / 10);
  return (
    <li className="meter" style={{ "--m": index } as CSSProperties}>
      <div className="meter__row">
        <span>{label}</span>
        <span className="mono meter__value" data-simulated>
          {value}%
        </span>
      </div>
      <div className="meter__dots" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={i < filled ? "is-on" : undefined}
            style={{ "--d": i } as CSSProperties}
          />
        ))}
      </div>
    </li>
  );
}

export function Bento() {
  return (
    <section className="section bento-section cv-auto" aria-labelledby="about-title">
      <div className="container">
        <SectionHead
          className="bento-head"
          eyebrow="About ROAAMM"
          id="about-title"
          title={
            <>
              Private, verified, <span className="serif">yours</span>
            </>
          }
        />

        <div className="bento">
          <Reveal className="bento__card bento__card--dark" data-tilt data-glare>
            <p className="bento__promise">
              Everyone you meet has shown ID. Your chats and calls are end-to-end encrypted, so
              not even ROAAMM can read them.
            </p>
            <p className="bento__small">
              You choose who sees your trips, and you can leave any conversation at any time.
            </p>
            <Button href="/demo" variant="inverse" size="lg" arrow>
              Try demo
            </Button>
          </Reveal>

          <Reveal variant="scale" delay={1} className="bento__card bento__card--photo" data-tilt data-glare>
            <Photo
              slot="bento-solo-traveller"
              alt="A traveller with a backpack, seen from behind, looking out over a city"
              sizes="(min-width: 900px) 30vw, 92vw"
            />
            <span className="glass-pill glass-pill--dark bento__chip">Made for you</span>
          </Reveal>

          <Reveal delay={2} className="bento__card bento__card--stats" data-simulated-scope data-tilt data-glare>
            <div className="bento__stats-head">
              <h3>Community health</h3>
              <Badge>Simulated data</Badge>
            </div>
            <ul className="meters">
              {METERS.map((m, i) => (
                <DotMeter key={m.label} index={i} {...m} />
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
