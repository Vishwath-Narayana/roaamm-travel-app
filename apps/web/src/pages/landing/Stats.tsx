import { Badge } from "../../components/Badge";
import { useReveal } from "../../motion";
import "./Stats.css";

// Not real numbers: always shown with the "Simulated data" label.
const STATS = [
  { value: "212k", label: "travellers" },
  { value: "1,326", label: "guides" },
  { value: "41", label: "countries" },
  { value: "58k", label: "trips planned" },
];

export function Stats() {
  const ref = useReveal<HTMLDListElement>();
  return (
    <section className="section stats-section" aria-labelledby="stats-title" data-simulated-scope>
      <div className="container">
        <div className="stats__head">
          <h2 id="stats-title">
            ROAAMM in <span className="serif">numbers</span>
          </h2>
          <Badge>Simulated data</Badge>
        </div>
        <dl className="stats" ref={ref}>
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <dt>{s.label}</dt>
              <dd data-simulated>{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
