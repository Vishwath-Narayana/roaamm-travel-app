import type { ReactNode } from "react";
import { Badge } from "../../components/Badge";
import { BoltIcon, ExternalIcon, GaugeIcon, LayersIcon, LockIcon } from "../../components/icons";
import { StatusRow } from "../../components/StatusRow";
import { REPO_URL } from "../../layouts/Footer";
import { Reveal } from "../../motion";
import { SERVICES } from "../../services";
import { SectionHead } from "./SectionHead";
import "./Build.css";

const STATUS_URL = new URL(SERVICES.find((s) => s.name === "status")!.url).origin;

// Honest facts: each card says what exists today and what is planned.
const FACTS: { title: string; body: string; status: string; icon: ReactNode }[] = [
  {
    title: "Real-time edge",
    body: "Chat traffic runs on Cloudflare Workers and Durable Objects, written in Rust and compiled to WebAssembly. Today the edge serves its health check; messaging lands in M5.",
    status: "Building",
    icon: <BoltIcon strokeWidth={1.5} />,
  },
  {
    title: "End-to-end encryption",
    body: "Chats use MLS (RFC 9420) and calls use SFrame, with a written threat model. The design and decision records are public; the implementation lands in M6 and M7.",
    status: "Designed",
    icon: <LockIcon strokeWidth={1.5} />,
  },
  {
    title: "Java core",
    body: "Accounts, verification, trips and bookings run on Java 25 and Spring Boot, compiled native, behind a Cloudflare Tunnel with no open ports.",
    status: "Building",
    icon: <LayersIcon strokeWidth={1.5} />,
  },
  {
    title: "Scale, measured",
    body: "Designed for 50,000 concurrent users; load test planned (M11). The report will be published with real numbers, good or bad.",
    status: "Planned",
    icon: <GaugeIcon strokeWidth={1.5} />,
  },
];

const LINKS = [
  { label: "README", href: `${REPO_URL}#readme` },
  { label: "System design", href: `${REPO_URL}/blob/main/docs/system-design.md` },
  { label: "Decision records", href: `${REPO_URL}/tree/main/docs/adr` },
  { label: "Status page", href: STATUS_URL },
  { label: "Repository", href: REPO_URL },
];

export function Build() {
  return (
    <section id="build" className="section cv-auto" aria-labelledby="build-title">
      <div className="container">
        <div className="build">
          <SectionHead
            className="build__head"
            eyebrow="How it's built"
            id="build-title"
            title={
              <>
                Engineering you can <span className="serif">check</span>
              </>
            }
            lead="ROAAMM is a portfolio project. These are the parts behind it, with what is live today and what is still planned."
          />
          <ul className="build__facts">
            {FACTS.map((f, i) => (
              <Reveal as="li" key={f.title} delay={i} className="fact">
                <div className="fact__top">
                  <span className="fact__icon">{f.icon}</span>
                  <Badge>{f.status}</Badge>
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </Reveal>
            ))}
          </ul>
          <Reveal as="ul" variant="fade" className="build__links" aria-label="Read more">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href}>
                  {l.label}
                  <ExternalIcon size={14} />
                </a>
              </li>
            ))}
          </Reveal>
          <div className="build__status">
            <h3 className="build__status-title">Live status</h3>
            <StatusRow />
          </div>
        </div>
      </div>
    </section>
  );
}
