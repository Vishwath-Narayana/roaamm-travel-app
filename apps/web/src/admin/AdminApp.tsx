// The admin console (M4b): the shared app shell (AppShell) with the admin
// navigation and screens. Loaded only by admins, on /app/admin/*.
import { lazy, Suspense, type ComponentType } from "react";
import { users } from "../api/admin";
import { Link } from "../router";
import { AppShell } from "./AppShell";
import { ADMIN_GROUPS, BASE, PAGES, slugOf } from "./nav";
import type { PaletteConfig } from "./Palette";
import { ScopeChip } from "./Sidebar";
import { DemoBanner, PageHead } from "./ui";
import { Overview } from "./screens/Overview";
import { Verification } from "./screens/Verification";
import { Users } from "./screens/Users";
import { Trips } from "./screens/Trips";
import { Audit } from "./screens/Audit";

// The board is its own chunk: most visits never need it.
const Guides = lazy(() => import("./screens/Guides").then((m) => ({ default: m.Guides })));

const SCREENS: Record<string, ComponentType> = {
  "": Overview,
  verification: Verification,
  "guide-applications": Guides,
  users: Users,
  trips: Trips,
  audit: Audit,
};

/** Pages, plus users found by name. */
export const ADMIN_PALETTE: PaletteConfig = {
  pages: PAGES,
  label: "Go to a page or find a user",
  placeholder: "Go to a page or find a user…",
  search: async (q, signal) =>
    (await users({ q, size: 6 }, signal)).items.map((u) => ({
      id: `user-${u.id}`,
      label: u.displayName,
      hint: `User · ${u.role}`,
      href: `/app/admin/users?q=${encodeURIComponent(u.displayName)}`,
      kind: "user" as const,
    })),
};

export function AdminApp({ path }: { path: string }) {
  const slug = slugOf(path);
  const page = PAGES.find((p) => p.slug === slug);
  const Screen = slug === null ? null : SCREENS[slug];
  const title = slug === null ? "Page not found" : (page?.label ?? "Admin");

  return (
    <AppShell
      product="Admin"
      base={BASE}
      groups={ADMIN_GROUPS}
      slug={slug ?? ""}
      title={title}
      allow={(me) => me.role === "admin"}
      roleLabel={(me) => (me.isDemo ? "Read-only demo admin" : "Admin")}
      scope={(me) => <ScopeChip isDemo={me.isDemo} />}
      banner={(me) => (me.isDemo ? <DemoBanner /> : null)}
      palette={ADMIN_PALETTE}
    >
      {Screen ? (
        <Suspense
          fallback={
            <p role="status" className="adm-page__lead">
              Loading…
            </p>
          }
        >
          <Screen />
        </Suspense>
      ) : (
        <div className="adm-page">
          <PageHead title="Page not found" />
          <p>
            <Link href={BASE} className="adm-link">
              Back to the overview
            </Link>
          </p>
        </div>
      )}
    </AppShell>
  );
}
