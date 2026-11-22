import type { ReactNode } from "react";
import { IdCardIcon, CalendarIcon, ShieldIcon } from "../../components/icons";
import { Reveal } from "../../motion";
import { SectionHead } from "./SectionHead";
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
  return (
    <section id="how-it-works" className="section cv-auto" aria-labelledby="how-title">
      <div className="container">
        <SectionHead
          className="how-head"
          eyebrow="How it works"
          id="how-title"
          title={
            <>
              Three steps to your <span className="serif">first trip</span>
            </>
          }
        />
        <div className="steps__line" aria-hidden="true" />
        <ol className="steps">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i} className="step" data-tilt data-glare>
              <div className="step__top">
                <span className="step__num mono" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="step__icon">{s.icon}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
