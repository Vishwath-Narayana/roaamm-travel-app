import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import {
  ApiFailure,
  dashboardPath,
  errorMessage,
  getMe,
  lastRole,
  signOut,
  type ApiError,
  type Me,
  type Role,
} from "../../api/session";
import { navigate, usePageTitle } from "../../router";
import "../Demo.css";
import { VerificationCard } from "./VerificationCard";
import "./Dashboard.css";

// Only admins download the queue and audit log.
const AdminPanel = lazy(() => import("./AdminPanel").then((m) => ({ default: m.AdminPanel })));

const LABEL: Record<Role, string> = { traveller: "Traveller", guide: "Guide", admin: "Admin" };

/** Placeholders only: the real dashboards land in later milestones. */
const PANELS: Record<Role, { title: string; body: string }[]> = {
  traveller: [
    { title: "Your trips", body: "Trips you plan, with dates and places. Arrives in M4." },
    {
      title: "Travellers on your dates",
      body: "People heading to the same place at the same time. Arrives in M4.",
    },
    { title: "Chats", body: "End-to-end encrypted conversations. Arrive in M5 and M6." },
  ],
  guide: [
    { title: "Guide profile", body: "What you offer, languages and areas. Arrives in M4." },
    { title: "Open slots", body: "Hourly slots travellers can book. Arrives in M4." },
    { title: "Bookings", body: "Incoming and upcoming bookings. Arrives in M4." },
  ],
  admin: [
    { title: "Guide approvals", body: "New guides to approve or decline. Arrives in M4." },
    { title: "Reports", body: "Reported users and messages. Arrives in a later milestone." },
  ],
};

type State = { kind: "loading" } | { kind: "ready"; me: Me } | { kind: "error"; error: ApiError };

export function Dashboard({ role }: { role: Role }) {
  usePageTitle(`${LABEL[role]} dashboard`);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  /** No session (any more): back to the demo page, saying so if it expired. */
  const signedOut = useCallback(() => {
    const expired = lastRole.get() !== null;
    lastRole.set(null);
    navigate(expired ? "/demo?session=expired" : "/demo", { replace: true });
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getMe().then(
      (me) => {
        if (cancelled) return;
        // A recovery-code sign-in must add a passkey first.
        if (me.needsNewPasskey) navigate("/account", { replace: true });
        // Signed in as another role: go to that role's dashboard.
        else if (me.role !== role) navigate(dashboardPath(me.role), { replace: true });
        else setState({ kind: "ready", me });
      },
      (e: unknown) => {
        if (cancelled) return;
        const error: ApiError = e instanceof ApiFailure ? e.error : { kind: "unavailable" };
        if (error.kind === "unauthenticated") {
          signedOut();
          return;
        }
        setState({ kind: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [role, signedOut]);

  useEffect(() => load(), [load]);

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      navigate("/demo?session=signed-out");
    } catch (e) {
      setSignOutError(errorMessage(e instanceof ApiFailure ? e.error : { kind: "unavailable" }));
      setSigningOut(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <div className="container page" aria-busy="true">
        <header className="page__head">
          <h1>{LABEL[role]} dashboard</h1>
          <p className="page__lead" role="status">
            Checking your demo session…
          </p>
        </header>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="container page">
        <header className="page__head">
          <h1>{LABEL[role]} dashboard</h1>
          <p className="demo__error" role="alert">
            {errorMessage(state.error)}
          </p>
        </header>
        <div className="dash__actions">
          <Button onClick={load}>Try again</Button>
          <Button href="/demo" variant="ghost">
            Back to the demo page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <header className="page__head dash__head">
        <div className="dash__title">
          <h1>{LABEL[role]} dashboard</h1>
          <p className="page__lead">
            {state.me.isDemo ? (
              <>
                Signed in as demo {role}
                {role === "admin" && " (read-only)"}
              </>
            ) : (
              <>Signed in as {state.me.displayName}</>
            )}
          </p>
        </div>
        <div className="dash__actions">
          <Badge>Simulated data</Badge>
          {!state.me.isDemo && (
            <Button href="/account" variant="ghost">
              Account
            </Button>
          )}
          <Button
            variant="secondary"
            loading={signingOut}
            disabled={signingOut}
            onClick={onSignOut}
          >
            Sign out
          </Button>
        </div>
      </header>
      {signOutError && (
        <p className="demo__error" role="alert">
          {signOutError}
        </p>
      )}
      <p className="dash__note small">
        {state.me.isDemo ? "This is a shared sandbox. " : ""}Everything here is simulated; more of
        the dashboard arrives in later milestones.
      </p>
      {role === "admin" ? (
        <Suspense fallback={<p role="status">Loading the admin tools…</p>}>
          <AdminPanel readOnly={state.me.isDemo} onSignedOut={signedOut} />
        </Suspense>
      ) : (
        <div className="dash__panels dash__panels--top">
          <VerificationCard onSignedOut={signedOut} />
        </div>
      )}
      <ul className="dash__panels" aria-label={`${LABEL[role]} panels`}>
        {PANELS[role].map((p) => (
          <Card as="li" key={p.title} className="dash__panel">
            <h2 className="dash__panel-title">{p.title}</h2>
            <p>{p.body}</p>
          </Card>
        ))}
      </ul>
    </div>
  );
}
