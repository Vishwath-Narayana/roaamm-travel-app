import { Badge } from "../../components/Badge";
import { Odometer } from "../../components/Odometer";
import { Reveal, useReveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Stats.css";

// Not real numbers: always shown with the "Simulated data" label.
const STATS = [
  { value: "212k", label: "travellers" },
  { value: "1,326", label: "guides" },
  { value: "41", label: "countries" },
  { value: "58k", label: "trips planned" },
];

/** Rolls to its value once it scrolls into view (instantly under reduced motion). */
export function CountUp({ value }: { value: string }) {
  const [ref, shown] = useReveal<HTMLSpanElement>();
  return (
    <span ref={ref} className="count-up">
      <Odometer value={value} run={shown} />
    </span>
  );
}

export function Stats() {
  return (
    <section
      className="section stats-section cv-auto"
      aria-labelledby="stats-title"
      data-simulated-scope
    >
      <div className="container">
        <SectionHead
          className="stats__head"
          eyebrow="By the numbers"
          id="stats-title"
          title={
            <>
              ROAAMM in <span className="serif">numbers</span>
            </>
          }
          aside={<Badge>Simulated data</Badge>}
        />
        <div className="stats__rule" aria-hidden="true" />
        <dl className="stats">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i} className="stat">
              <dt>{s.label}</dt>
              <dd data-simulated>
                <CountUp value={s.value} />
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
