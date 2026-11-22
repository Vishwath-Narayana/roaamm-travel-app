import type { ReactNode } from "react";
import { Reveal } from "../../motion";

type SectionHeadProps = {
  eyebrow: string;
  /** id for the h2, used by the section's aria-labelledby. */
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Extra content on the right of the head (buttons, badges). */
  aside?: ReactNode;
  className?: string;
};

/** Eyebrow, heading and optional lead, revealed in a short stagger. */
export function SectionHead({ eyebrow, id, title, lead, aside, className }: SectionHeadProps) {
  const head = (
    <div className="section-head">
      <Reveal as="p" variant="fade" className="eyebrow">
        {eyebrow}
      </Reveal>
      <Reveal as="h2" id={id} delay={1} variant="mask-line">
        {title}
      </Reveal>
      {lead && (
        <Reveal as="p" className="lead" delay={2}>
          {lead}
        </Reveal>
      )}
    </div>
  );
  if (!aside) return <div className={className}>{head}</div>;
  return (
    <div className={["section-head-row", className].filter(Boolean).join(" ")}>
      {head}
      <Reveal variant="fade" delay={2} className="section-head-row__aside">
        {aside}
      </Reveal>
    </div>
  );
}
