import { useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusRow } from "../components/StatusRow";
import {
  ApiFailure,
  dashboardPath,
  errorMessage,
  startDemoSession,
  type Role,
} from "../api/session";
import { LiveSection } from "../live/LiveSection";
import { navigate, usePageTitle } from "../router";
import "./Demo.css";

const ROLES: { role: Role; label: string; body: string }[] = [
  {
    role: "traveller",
    label: "Traveller",
    body: "Your trips, travellers on your dates, encrypted chats and a guide booking.",
  },
  {
    role: "guide",
    label: "Guide",
    body: "Your guide profile, open hourly slots and incoming bookings.",
  },
  {
    role: "admin",
    label: "Admin",
    body: "The ID verification queue, guide approvals and reports. Read-only.",
  },
];

/** Messages for /demo?session=… after leaving a dashboard. */
const NOTICES: Record<string, string> = {
  expired: "Your demo session ended. Sessions last 8 hours. Pick a role to start a new one.",
  "signed-out": "You are signed out.",
};

export function Demo() {
  usePageTitle("Try the demo");
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notice = NOTICES[new URLSearchParams(window.location.search).get("session") ?? ""];

  async function open(role: Role) {
    setPending(role);
    setError(null);
    try {
      await startDemoSession(role);
      navigate(dashboardPath(role));
    } catch (e) {
      setError(errorMessage(e instanceof ApiFailure ? e.error : { kind: "unavailable" }));
      setPending(null);
    }
  }

  return (
    <div className="container page">
      <header className="page__head">
        <h1>Try the demo</h1>
        <p className="page__lead">
          One click, no sign-up. Pick a role to open a shared sandbox account filled with simulated
          data.
        </p>
      </header>

      <section className="demo__section demo__section--first" aria-labelledby="roles-title">
        <h2 id="roles-title" className="demo__h2">
          Sandbox accounts
        </h2>

        {notice && !error && (
          <p className="demo__notice" role="status">
            {notice}
          </p>
        )}
        <div aria-live="assertive">
          {error && (
            <p className="demo__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <ul className="roles">
          {ROLES.map((r) => {
            const id = `role-${r.role}`;
            return (
              <Card as="li" key={r.role} className="role">
                <div className="role__head">
                  <h3 id={id}>{r.label}</h3>
                  <Badge>Simulated data</Badge>
                </div>
                <p id={`${id}-body`}>{r.body}</p>
                <Button
                  variant="secondary"
                  arrow
                  loading={pending === r.role}
                  disabled={pending !== null}
                  aria-describedby={`${id}-body`}
                  onClick={() => open(r.role)}
                >
                  {pending === r.role ? `Opening ${r.label}…` : `Open as ${r.label}`}
                </Button>
              </Card>
            );
          })}
        </ul>

        <Card className="note" as="section" aria-labelledby="demo-note">
          <h3 id="demo-note">About the sandbox</h3>
          <p>
            Every visitor of a role shares the same demo account, so never type anything real. Data
            is simulated and reset on a schedule, sessions last 8 hours, and the admin account can
            look but not change anything. Real accounts with passkeys come in a later milestone.
          </p>
        </Card>
      </section>

      <LiveSection id="preview" className="demo__live" />

      <section className="demo__section" aria-labelledby="status-title">
        <h2 id="status-title" className="demo__h2">
          Live system status
        </h2>
        <StatusRow />
      </section>

      <p className="page__back">
        <Button href="/" variant="ghost">
          Back to home
        </Button>
      </p>
    </div>
  );
}
