import { Badge } from "../../components/Badge";
import { Reveal, useCountUp, useReveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Stats.css";

// Not real numbers: always shown with the "Simulated data" label.
const STATS = [
  { value: "212k", label: "travellers" },
  { value: "1,326", label: "guides" },
  { value: "41", label: "countries" },
  { value: "58k", label: "trips planned" },
];

/** "1,326" -> 1326 with a thousands separator; "212k" -> 212 with suffix "k". */
function parse(value: string) {
  const m = value.match(/^([\d,]+)(.*)$/);
  if (!m) return { n: 0, suffix: value, comma: false };
  return { n: Number(m[1].replace(/,/g, "")), suffix: m[2], comma: m[1].includes(",") };
}

/**
 * Counts up once when it scrolls into view. The final value is always in the
 * DOM (visually hidden) so screen readers and tests read the real number;
 * the animated digits are aria-hidden.
 */
export function CountUp({ value }: { value: string }) {
  const [ref, shown] = useReveal<HTMLSpanElement>();
  const { n, suffix, comma } = parse(value);
  const current = useCountUp(n, shown);
  const text = (comma ? current.toLocaleString("en-US") : String(current)) + suffix;
  return (
    <span ref={ref} className="count-up">
      <span className="visually-hidden">{value}</span>
      <span aria-hidden="true" data-testid="count-anim">
        {text}
      </span>
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
