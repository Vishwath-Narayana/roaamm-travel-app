import type { ReactNode } from "react";
import { IdCardIcon, CalendarIcon, ShieldIcon } from "../../components/icons";
import { useReveal } from "../../motion";
import "./HowItWorks.css";

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Verify",
    body: "Confirm your ID once. Everyone you meet has done the same.",
    icon: <IdCardIcon strokeWidth={1.5} />,
  },
  {
    title: "Match or book",
    body: "Find travellers on your dates, or book a local guide by the hour.",
    icon: <CalendarIcon strokeWidth={1.5} />,
  },
  {
    title: "Travel with safety tools",
    body: "SOS, live location and check-in timers stay one tap away.",
    icon: <ShieldIcon strokeWidth={1.5} />,
  },
];

export function HowItWorks() {
  const ref = useReveal<HTMLOListElement>();
  return (
    <section id="how-it-works" className="section" aria-labelledby="how-title">
      <div className="container">
        <div className="section-head how-head">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">
            Three steps to your <span className="serif">first trip</span>
          </h2>
        </div>
        <ol className="steps" ref={ref}>
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <div className="step__top">
                <span className="step__num mono" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="step__icon">{s.icon}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
