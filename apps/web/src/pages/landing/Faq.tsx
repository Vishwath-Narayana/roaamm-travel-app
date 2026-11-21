import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { REPO_URL } from "../../layouts/Footer";
import { prefersReducedMotion, Reveal } from "../../motion";
import { SectionHead } from "./SectionHead";
import "./Faq.css";

const DOCS = `${REPO_URL}/blob/main/docs`;

const ITEMS: { q: string; a: ReactNode }[] = [
  {
    q: "How does ID verification work?",
    a: (
      <>
        You upload a photo of an ID document. Your browser encrypts it to the admin team's key, so
        the server only stores ciphertext. An admin checks it and you get the Verified badge. In
        this portfolio version the check is a mock: no real documents are needed.
      </>
    ),
  },
  {
    q: "Who can read my chats?",
    a: (
      <>
        Only the people in the conversation. Chats use end-to-end encryption with MLS (RFC 9420),
        and calls use SFrame. One honest limit: on the web, the server delivers the JavaScript you
        run, so you have to trust that code. The{" "}
        <a href={`${DOCS}/security.md`}>threat model</a> explains it.
      </>
    ),
  },
  {
    q: "What does a guide cost?",
    a: (
      <>
        Each guide sets an hourly rate in local currency, shown before you book. You pick 1 to 4
        hours and see the total. Payments will run in Razorpay test mode, so no real money moves.
      </>
    ),
  },
  {
    q: "How does SOS work?",
    a: (
      <>
        Pressing SOS sends your location to your emergency contacts over an encrypted channel, plus
        an email to contacts who agreed to receive one. A missed check-in timer escalates the same
        way.
      </>
    ),
  },
  {
    q: "Is this a real product?",
    a: (
      <>
        No. ROAAMM is a portfolio project. The real-time engine and the encryption are being built
        for real, but every traveller, guide, trip, review and number on this site is simulated.
      </>
    ),
  },
  {
    q: "Where is the source code?",
    a: (
      <>
        All of it is public on <a href={REPO_URL}>GitHub</a>, with the design docs and
        architecture decision records.
      </>
    ),
  },
];

const CLOSE_MS = 300;

/**
 * A native <details> that opens and closes smoothly (grid rows 0fr to 1fr).
 * Closed <details> content is not rendered, so on close it stays open until
 * the animation ends. Keyboard and find-in-page keep working natively.
 */
export function FaqItem({ q, children }: { q: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  const closing = useRef<number | undefined>(undefined);

  function onSummaryClick(e: MouseEvent) {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return; // native, instant toggle
    e.preventDefault();
    window.clearTimeout(closing.current);
    if (!el.open) {
      el.open = true;
      // Make the browser compute the collapsed (0fr) state before expanding,
      // otherwise there is nothing to transition from.
      void el.querySelector<HTMLElement>(".faq__answer")?.offsetHeight;
      setExpanded(true);
    } else {
      setExpanded(false);
      closing.current = window.setTimeout(() => {
        if (ref.current) ref.current.open = false;
      }, CLOSE_MS);
    }
  }

  return (
    <details
      ref={ref}
      className="faq__item"
      data-expanded={expanded}
      // Opened by find-in-page, keyboard or the reduced-motion path.
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary onClick={onSummaryClick}>
        <span>{q}</span>
        <span className="faq__icon" aria-hidden="true" />
      </summary>
      <div className="faq__answer">
        <div>
          <p>{children}</p>
        </div>
      </div>
    </details>
  );
}

export function Faq() {
  return (
    <section id="faq" className="section cv-auto" aria-labelledby="faq-title">
      <div className="container faq">
        <SectionHead
          eyebrow="FAQ"
          id="faq-title"
          title={
            <>
              Good <span className="serif">questions</span>
            </>
          }
        />
        <Reveal className="faq__list">
          {ITEMS.map((item) => (
            <FaqItem key={item.q} q={item.q}>
              {item.a}
            </FaqItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
