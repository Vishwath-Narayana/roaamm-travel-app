import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { usePageTitle } from "../router";
import "./Demo.css";

const ROLES = [
  {
    role: "Traveller",
    body: "Your trips, travellers on your dates, encrypted chats and a guide booking.",
  },
  { role: "Guide", body: "Your guide profile, open hourly slots and incoming bookings." },
  { role: "Admin", body: "The ID verification queue, guide approvals and reports." },
];

export function Demo() {
  usePageTitle("Try the demo");
  return (
    <div className="container page">
      <header className="page__head">
        <h1>Try the demo</h1>
        <p className="page__lead">Pick a role to explore ROAAMM with sample data.</p>
      </header>

      <ul className="roles">
        {ROLES.map((r) => {
          const id = `role-${r.role.toLowerCase()}`;
          return (
            <Card as="li" key={r.role} className="role">
              <div className="role__head">
                <h2 id={id}>{r.role}</h2>
                <Badge>Opens in M2</Badge>
              </div>
              <p>{r.body}</p>
              <Button disabled variant="secondary" aria-describedby={`${id}-note`}>
                Open as {r.role}
              </Button>
              <span id={`${id}-note`} className="visually-hidden">
                Available in milestone M2
              </span>
            </Card>
          );
        })}
      </ul>

      <Card className="note" as="section" aria-labelledby="demo-note">
        <h2 id="demo-note">Why the buttons are off</h2>
        <p>
          Sandbox accounts arrive in the next milestone (M2). Until then nothing on this page signs
          you in. When they land, each role opens a fresh sample account filled with simulated
          data.
        </p>
      </Card>

      <p className="page__back">
        <Button href="/" variant="ghost">
          Back to home
        </Button>
      </p>
    </div>
  );
}
