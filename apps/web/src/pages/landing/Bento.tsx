import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Photo } from "../../components/Photo";
import { useReveal } from "../../motion";
import "./Bento.css";

// Not real numbers: shown with the "Simulated data" label.
const METERS = [
  { label: "Profiles ID-verified", value: 100 },
  { label: "Replies within a day", value: 84 },
  { label: "Trips with a local guide", value: 36 },
];

function DotMeter({ label, value }: { label: string; value: number }) {
  const filled = Math.round(value / 10);
  return (
    <li className="meter">
      <div className="meter__row">
        <span>{label}</span>
        <span className="mono meter__value" data-simulated>
          {value}%
        </span>
      </div>
      <div className="meter__dots" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i < filled ? "is-on" : undefined} />
        ))}
      </div>
    </li>
  );
}

export function Bento() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section className="section bento-section" aria-labelledby="about-title">
      <div className="container">
        <div className="section-head bento-head">
          <p className="eyebrow">About ROAAMM</p>
          <h2 id="about-title">
            Private, verified, <span className="serif">yours</span>
          </h2>
        </div>

        <div className="bento" ref={ref}>
          <div className="bento__card bento__card--dark">
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
          </div>

          <div className="bento__card bento__card--photo">
            <Photo
              slot="bento-solo-traveller"
              alt="A traveller with a backpack, seen from behind, looking out over a city"
              sizes="(min-width: 900px) 30vw, 92vw"
            />
            <span className="glass-pill glass-pill--dark bento__chip">Made for you</span>
          </div>

          <div className="bento__card bento__card--stats" data-simulated-scope>
            <div className="bento__stats-head">
              <h3>Community health</h3>
              <Badge>Simulated data</Badge>
            </div>
            <ul className="meters">
              {METERS.map((m) => (
                <DotMeter key={m.label} {...m} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
