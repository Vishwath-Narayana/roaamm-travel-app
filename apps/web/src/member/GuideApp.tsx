// The guide app (M4c): the shared app shell for guides. Overview and Profile
// read the approved guide application; Availability and Bookings say what
// they will do (M9). No made-up data, except a clearly labelled sample
// profile for the demo guide, who has no application of their own.
import type { ReactNode } from "react";
import { LANGUAGE_NAME } from "../api/admin";
import { myApplication, type Mine, type MyApplication } from "../api/member";
import type { Me } from "../api/session";
import { AppShell } from "../admin/AppShell";
import { CalendarIcon, ClockIcon, CompassIcon, GridIcon, InboxIcon, LifebuoyIcon, TicketIcon, UsersIcon } from "../admin/icons";
import type { NavGroup, NavItem } from "../admin/nav";
import type { PaletteConfig } from "../admin/Palette";
import { Chip, DemoBanner, ErrorState, PageHead, Pill, SkeletonBlock, fmtDate, useAdminData } from "../admin/ui";
import { useAdmin } from "../admin/context";
import { Link } from "../router";
import { SampleChip } from "./parts";

const G_BASE = "/app/guide";

const MAIN: NavItem[] = [
  { slug: "", label: "Overview", href: G_BASE, icon: GridIcon },
  { slug: "profile", label: "Profile", href: `${G_BASE}/profile`, icon: UsersIcon },
  { slug: "availability", label: "Availability", href: `${G_BASE}/availability`, icon: CalendarIcon },
  { slug: "bookings", label: "Bookings", href: `${G_BASE}/bookings`, icon: TicketIcon },
];

const GROUPS: NavGroup[] = [
  { label: "Main", items: MAIN },
  { label: "Coming soon", soon: [{ label: "Safety", milestone: "M8", icon: LifebuoyIcon }] },
];

const PALETTE: PaletteConfig = { pages: MAIN, label: "Go to a page", placeholder: "Go to a page…" };

/** Shown to the demo guide only, always with the Sample chip. */
const SAMPLE_PROFILE: MyApplication = {
  id: "sample",
  status: "approved",
  headline: "Harbour walks at sunrise",
  bio: "Simulated profile. Slow morning walks along the harbour, with stops for coffee and the fish market.",
  languages: ["en", "pt"],
  cities: ["Lisbon"],
  createdAt: "2026-10-01T09:00:00Z",
  decidedAt: "2026-10-03T09:00:00Z",
};

type Profile = { app: MyApplication | null; sample: boolean };

/** The guide's approved application, or the labelled sample for the demo guide. */
function useProfile() {
  const { me } = useAdmin();
  return useAdminData<Profile>("guide:profile", async (s) => {
    const m: Mine = await myApplication(s);
    const app = m.application?.status === "approved" ? m.application : null;
    return app || !me.isDemo ? { app, sample: false } : { app: SAMPLE_PROFILE, sample: true };
  });
}

function Loaded({ children }: { children: (p: Profile) => ReactNode }) {
  const { state, reload } = useProfile();
  if (state.kind === "error" && !state.data)
    return (
      <section className="adm-card">
        <ErrorState message={state.message} onRetry={reload} />
      </section>
    );
  if (!state.data)
    return (
      <section className="adm-card">
        <SkeletonBlock lines={4} />
      </section>
    );
  return <>{children(state.data)}</>;
}

function Soon({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="adm-card adm-placeholder" aria-label={title}>
      <header className="adm-card__head">
        <h2>{title}</h2>
        <Chip>Coming in M9</Chip>
      </header>
      <div className="adm-state">
        <span className="adm-state__icon" aria-hidden="true">
          {icon}
        </span>
        <p className="adm-state__text">{children}</p>
      </div>
    </section>
  );
}

function Overview() {
  return (
    <div className="adm-page">
      <PageHead title="Overview" lead="Your guide account at a glance." />
      {/* Everything below the head renders once the profile has answered:
          nothing exists below a growing card to be pushed (no layout shift). */}
      <Loaded>
        {({ app, sample }) => (
          <>
            <section className="adm-card adm-card__body" aria-labelledby="g-app">
              <header className="adm-card__head">
                <h2 id="g-app">Guide application</h2>
                <span className="adm-inline">
                  {app && <Pill status="approved" />}
                  {sample && <SampleChip />}
                </span>
              </header>
              <p className="adm-note">
                {app
                  ? `Approved on ${fmtDate(app.decidedAt)}. Travellers will find you by your headline, languages and cities.`
                  : "No approved application on file. Guides are created when an admin approves a traveller's application."}
              </p>
              {app && (
                <p>
                  <Link href={`${G_BASE}/profile`} className="adm-btn adm-btn--secondary">
                    See your profile
                  </Link>
                </p>
              )}
            </section>
            <div className="adm-grid-2">
              <Soon icon={<TicketIcon size={20} />} title="Upcoming bookings">
                Tours travellers book with you, with dates and times.
              </Soon>
              <Soon icon={<ClockIcon size={20} />} title="Earnings">
                What you earn per tour, paid through test checkout.
              </Soon>
            </div>
          </>
        )}
      </Loaded>
    </div>
  );
}

function Profile() {
  return (
    <div className="adm-page">
      <PageHead title="Profile" lead="What travellers will see. Read-only: it comes from your approved application." />
      <Loaded>
        {({ app, sample }) =>
          app ? (
            <section className="adm-card adm-card__body" aria-labelledby="g-profile">
              <header className="adm-card__head">
                <h2 id="g-profile">{app.headline}</h2>
                {sample && <SampleChip />}
              </header>
              {sample && <p className="adm-note">The demo guide has no application of their own: this sample shows the layout.</p>}
              <dl className="adm-facts">
                <dt>Languages</dt>
                <dd>{app.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(", ")}</dd>
                <dt>Cities</dt>
                <dd>{app.cities.join(", ")}</dd>
                <dt>About</dt>
                <dd className="adm-pre">{app.bio}</dd>
                <dt>Approved</dt>
                <dd className="adm-num">{fmtDate(app.decidedAt)}</dd>
              </dl>
            </section>
          ) : (
            <section className="adm-card">
              <div className="adm-state" role="status">
                <span className="adm-state__icon" aria-hidden="true">
                  <CompassIcon size={20} />
                </span>
                <p className="adm-state__text">No approved application on file, so there is no profile to show yet.</p>
              </div>
            </section>
          )
        }
      </Loaded>
    </div>
  );
}

function Availability() {
  return (
    <div className="adm-page">
      <PageHead title="Availability" lead="When travellers can book you." />
      <Soon icon={<CalendarIcon size={20} />} title="Weekly hours">
        Set the hours you can guide each week and block out days off. Travellers book open slots by the hour.
      </Soon>
    </div>
  );
}

function Bookings() {
  return (
    <div className="adm-page">
      <PageHead title="Bookings" lead="Requests and upcoming tours." />
      <Soon icon={<InboxIcon size={20} />} title="Your bookings">
        Booking requests from travellers, then your confirmed tours, each with its own chat.
      </Soon>
    </div>
  );
}

const SCREENS: Record<string, { title: string; screen: () => ReactNode }> = {
  "": { title: "Overview", screen: Overview },
  profile: { title: "Profile", screen: Profile },
  availability: { title: "Availability", screen: Availability },
  bookings: { title: "Bookings", screen: Bookings },
};

export function GuideApp({ path }: { path: string }) {
  const slug = path === G_BASE ? "" : path.startsWith(`${G_BASE}/`) ? path.slice(G_BASE.length + 1) : null;
  const page = slug !== null ? SCREENS[slug] : undefined;
  return (
    <AppShell
      product="Guide"
      base={G_BASE}
      groups={GROUPS}
      slug={slug ?? ""}
      title={page?.title ?? "Page not found"}
      allow={(me: Me) => me.role === "guide"}
      roleLabel={(me) => (me.isDemo ? "Read-only demo guide" : "Guide")}
      banner={(me) => (me.isDemo ? <DemoBanner text="The sample profile is simulated; bookings and availability arrive in M9." /> : null)}
      palette={PALETTE}
      anonymousTo="/demo"
    >
      {page ? (
        <page.screen />
      ) : (
        <div className="adm-page">
          <PageHead title="Page not found" />
          <p>
            <Link href={G_BASE} className="adm-link">
              Back to the overview
            </Link>
          </p>
        </div>
      )}
    </AppShell>
  );
}
