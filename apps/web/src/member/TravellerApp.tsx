// The traveller app (M4c): the shared app shell with the traveller's own
// trips and guide application. Loaded on demand, on /app/traveller/*.
// Admins may open it to see what travellers see (read-only, no data of their own).
import { lazy, Suspense, type ReactNode } from "react";
import { AppShell, type Crumb } from "../admin/AppShell";
import { CompassIcon, GridIcon, LifebuoyIcon, MapIcon, TicketIcon } from "../admin/icons";
import type { NavGroup, NavItem } from "../admin/nav";
import type { PaletteConfig } from "../admin/Palette";
import { DemoBanner, PageHead } from "../admin/ui";
import type { Me } from "../api/session";
import { ToastProvider } from "../components/Toast";
import { Link } from "../router";
import { TravellerOverview } from "./TravellerOverview";
import { TripsList } from "./Trips";

// Forms and detail pages are their own chunks: the overview and the list are what most visits need.
const TripDetail = lazy(() => import("./TripPages").then((m) => ({ default: m.TripDetail })));
const TripForm = lazy(() => import("./TripPages").then((m) => ({ default: m.TripFormPage })));
const BecomeGuide = lazy(() => import("./BecomeGuide").then((m) => ({ default: m.BecomeGuide })));

export const T_BASE = "/app/traveller";

const MAIN: NavItem[] = [
  { slug: "", label: "Overview", href: T_BASE, icon: GridIcon },
  { slug: "trips", label: "Trips", href: `${T_BASE}/trips`, icon: MapIcon },
  { slug: "become-a-guide", label: "Become a guide", href: `${T_BASE}/become-a-guide`, icon: CompassIcon },
];

const GROUPS: NavGroup[] = [
  { label: "Main", items: MAIN },
  {
    label: "Coming soon",
    soon: [
      { label: "Bookings", milestone: "M9", icon: TicketIcon },
      { label: "Safety", milestone: "M8", icon: LifebuoyIcon },
    ],
  },
];

const PALETTE: PaletteConfig = {
  pages: [...MAIN, { slug: "trips-new", label: "New trip", href: `${T_BASE}/trips/new`, icon: MapIcon }],
  label: "Go to a page",
  placeholder: "Go to a page…",
};

const UUID = "[0-9a-f-]{36}";

type Route = { slug: string; title: string; crumbs?: Crumb[]; screen: ReactNode };

/** The screen for a path under /app/traveller, or null if there is none. */
export function travellerRoute(path: string): Route | null {
  const rest = path === T_BASE ? "" : path.startsWith(`${T_BASE}/`) ? path.slice(T_BASE.length + 1) : null;
  if (rest === null) return null;
  const trips: Crumb[] = [{ label: "Trips", href: `${T_BASE}/trips` }];
  if (rest === "") return { slug: "", title: "Overview", screen: <TravellerOverview /> };
  if (rest === "trips") return { slug: "trips", title: "Trips", screen: <TripsList /> };
  if (rest === "trips/new") return { slug: "trips", title: "New trip", crumbs: trips, screen: <TripForm /> };
  if (rest === "become-a-guide") return { slug: "become-a-guide", title: "Become a guide", screen: <BecomeGuide /> };
  const detail = new RegExp(`^trips/(${UUID})(/edit)?$`).exec(rest);
  if (detail) {
    const id = detail[1]!;
    return detail[2]
      ? { slug: "trips", title: "Edit trip", crumbs: trips, screen: <TripForm key={id} id={id} /> }
      : { slug: "trips", title: "Trip", crumbs: trips, screen: <TripDetail key={id} id={id} /> };
  }
  return null;
}

/** The demo traveller and an admin looking in both see every action, disabled. */
function banner(me: Me) {
  if (me.role === "admin")
    return (
      <DemoBanner
        title="Viewing as a traveller."
        text="Admins have no trips or guide application of their own, so lists stay empty and actions are disabled."
        short="Viewing as traveller"
      />
    );
  return me.isDemo ? (
    <DemoBanner text="Sample trips are simulated; create and edit are shown but disabled." />
  ) : null;
}

export function TravellerApp({ path }: { path: string }) {
  const route = travellerRoute(path);
  return (
    <ToastProvider>
      <AppShell
        product="Traveller"
        base={T_BASE}
        groups={GROUPS}
        slug={route?.slug ?? ""}
        title={route?.title ?? "Page not found"}
        crumbs={route?.crumbs}
        allow={(me) => me.role === "traveller" || me.role === "admin"}
        readOnly={(me) => me.isDemo || me.role === "admin"}
        roleLabel={(me) => (me.role === "admin" ? "Admin, viewing as traveller" : me.isDemo ? "Read-only demo traveller" : "Traveller")}
        banner={banner}
        palette={PALETTE}
        anonymousTo="/demo"
      >
        <Suspense
          fallback={
            <p role="status" className="adm-page__lead">
              Loading…
            </p>
          }
        >
          {route ? (
            route.screen
          ) : (
            <div className="adm-page">
              <PageHead title="Page not found" />
              <p>
                <Link href={T_BASE} className="adm-link">
                  Back to the overview
                </Link>
              </p>
            </div>
          )}
        </Suspense>
      </AppShell>
    </ToastProvider>
  );
}
