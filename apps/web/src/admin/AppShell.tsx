// One app shell for every signed-in area: the admin console (M4b) and the
// traveller and guide apps (M4c). Sidebar 248 px (an icon rail on tablets),
// top bar 56 px, a bottom-sheet menu on phones, the theme toggle and the
// Cmd/Ctrl+K palette. Each area passes its navigation, who may use it and
// the screen to show; the shell checks the session, guards the role and
// renders a "no access" page for anyone else.
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ApiFailure,
  dashboardPath,
  errorMessage,
  getMe,
  lastRole,
  signOut,
  type ApiError,
  type Me,
} from "../api/session";
import { clearAdminCache } from "../api/admin";
import { ThemeToggle } from "../components/TopNav";
import { Link, navigate, usePageTitle } from "../router";
import { AccountMenu } from "./AccountMenu";
import { AdminContext, type AdminContextValue } from "./context";
import { AlertIcon, MarkIcon, MenuIcon, SearchIcon, SidebarIcon } from "./icons";
import type { NavGroup } from "./nav";
import type { PaletteConfig } from "./Palette";
import { NavGroups } from "./Sidebar";
import { Drawer, ErrorState, PageHead, useIsPhone, useMedia } from "./ui";
import "./admin.css";

// The palette is its own chunk: most visits never open it.
const Palette = lazy(() => import("./Palette").then((m) => ({ default: m.Palette })));

const COLLAPSE_KEY = "roaamm:admin-sidebar";
/** Tablets get the icon rail whatever the saved choice is. */
const TABLET = "(min-width: 768px) and (max-width: 1023px)";
/** How long a tapped unavailable control shows its reason. */
const TIP_MS = 2400;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export type Crumb = { label: string; href?: string };

export type ShellProps = {
  /** "Admin", "Traveller" or "Guide": the brand's second word and the first crumb. */
  product: string;
  /** The area's home, e.g. /app/traveller. */
  base: string;
  groups: NavGroup[];
  /** The nav item to mark as the current page. */
  slug: string;
  /** The page title: the h1 (the top bar's on phones) and the last crumb. */
  title: string;
  /** Crumbs between the area and the page, e.g. Trips on a trip's page. */
  crumbs?: Crumb[];
  /** Who may use this area. Anyone else signed in sees "No access". */
  allow: (me: Me) => boolean;
  /** Whether action controls are shown disabled (the demo accounts). */
  readOnly?: (me: Me) => boolean;
  /**
   * Where a visitor with no session goes: the admin console sends them to
   * sign in; the traveller and guide apps to the demo page (saying the
   * session expired if this browser had one).
   */
  anonymousTo?: "/login" | "/demo";
  /** The account menu's second line, e.g. "Read-only demo admin". */
  roleLabel: (me: Me) => string;
  /** Under the brand in the sidebar and the phone menu. */
  scope?: (me: Me) => ReactNode;
  /** The one page-level note at the top of every screen (the demo banner). */
  banner?: (me: Me) => ReactNode;
  palette: PaletteConfig;
  children: ReactNode;
};

type State = { kind: "loading" } | { kind: "ready"; me: Me } | { kind: "error"; error: ApiError };

const AREA_OF: Record<Me["role"], string> = { traveller: "traveller", guide: "guide", admin: "admin" };

export function AppShell({
  product,
  base,
  groups,
  slug,
  title,
  crumbs = [],
  allow,
  readOnly = (me) => me.isDemo,
  roleLabel,
  anonymousTo = "/login",
  scope,
  banner,
  palette: paletteConfig,
  children,
}: ShellProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const meRef = useRef<Me | null>(null);
  const tablet = useMedia(TABLET);
  const isPhone = useIsPhone();
  const rail = collapsed || tablet;
  const me = state.kind === "ready" ? state.me : null;
  const denied = me !== null && !allow(me);
  const shownTitle = denied ? "No access" : title;
  usePageTitle(`${shownTitle} · ${product}`);

  // A tap (or click) on an unavailable control shows its reason for a moment:
  // touch screens have no hover, so the title tooltip alone is not enough.
  useEffect(() => {
    let timer = 0;
    let shown: Element | null = null;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const tip = target?.closest?.("[data-tip]");
      if (!tip) return;
      const off =
        tip.getAttribute("aria-disabled") === "true" || tip.querySelector('[aria-disabled="true"]');
      if (!off) return;
      shown?.removeAttribute("data-tip-open");
      tip.setAttribute("data-tip-open", "");
      shown = tip;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => tip.removeAttribute("data-tip-open"), TIP_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.clearTimeout(timer);
    };
  }, []);

  /** 401: real accounts go to the sign-in page; a demo session goes back to the demo page. */
  const onSignedOut = useCallback(() => {
    const m = meRef.current;
    const hadSession = lastRole.get() !== null;
    lastRole.set(null);
    clearAdminCache();
    const to = m
      ? m.isDemo
        ? "/demo?session=expired"
        : "/login"
      : anonymousTo === "/demo" && hadSession
        ? "/demo?session=expired"
        : anonymousTo;
    navigate(to, { replace: true });
  }, [anonymousTo]);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getMe().then(
      (m) => {
        if (cancelled) return;
        if (m.needsNewPasskey) navigate("/account", { replace: true });
        else {
          meRef.current = m;
          setState({ kind: "ready", me: m });
        }
      },
      (e: unknown) => {
        if (cancelled) return;
        const error: ApiError = e instanceof ApiFailure ? e.error : { kind: "unavailable" };
        if (error.kind === "unauthenticated") onSignedOut();
        else setState({ kind: "error", error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onSignedOut]);
  useEffect(() => load(), [load]);

  // Cmd/Ctrl+K opens the palette from anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "expanded" : "collapsed");
      } catch {
        // Storage blocked: the choice lasts for this page view.
      }
      return !c;
    });
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      clearAdminCache();
      navigate("/demo?session=signed-out");
    }
  }

  // The shell renders from the first frame (placeholders until the session is
  // known), so nothing moves when the session check finishes.
  const ctx: AdminContextValue | null = me && !denied ? { me, readOnly: readOnly(me), onSignedOut } : null;
  const trail: Crumb[] = [...crumbs, { label: shownTitle }];

  return (
    <AdminContext.Provider value={ctx}>
      <div className="adm" data-collapsed={rail}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className="adm-sidebar" aria-label={product}>
          <div className="adm-sidebar__inner">
            <div className="adm-sidebar__head">
              <Link href={base} className="adm-brand" aria-label={`ROAAMM ${product}, overview`}>
                <span className="adm-logo" aria-hidden="true">
                  <MarkIcon size={20} />
                </span>
                <span className="adm-brand__name" aria-hidden="true">
                  ROAAMM <span className="adm-brand__sub">{product}</span>
                </span>
              </Link>
              <button
                type="button"
                className="adm-icon-btn adm-sidebar__collapse"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
              >
                <SidebarIcon size={16} />
              </button>
            </div>
            {scope && (
              <div className="adm-sidebar__scope">
                {me ? scope(me) : <span className="adm-scope adm-scope--pending" aria-hidden="true" />}
              </div>
            )}
            <nav className="adm-nav" aria-label={`${product} sections`}>
              <NavGroups groups={groups} slug={slug} collapsed={rail} />
            </nav>
          </div>
        </aside>
        <div className="adm-body">
          <header className="adm-topbar">
            <button
              type="button"
              className="adm-icon-btn adm-topbar__menu"
              aria-label="Open menu"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
            >
              <MenuIcon size={20} />
            </button>
            {/* Below 768 px this title is the page's one h1 (PageHead leaves it out). */}
            {isPhone ? (
              <h1 className="adm-topbar__title">{shownTitle}</h1>
            ) : (
              <p className="adm-topbar__title" aria-hidden="true">
                {shownTitle}
              </p>
            )}
            <nav aria-label="Breadcrumb" className="adm-crumbs">
              <ol>
                <li>
                  <Link href={base}>{product}</Link>
                </li>
                {trail.map((c, i) =>
                  i === trail.length - 1 ? (
                    <li key={i} aria-current="page">
                      {c.label}
                    </li>
                  ) : (
                    <li key={i}>{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</li>
                  ),
                )}
              </ol>
            </nav>
            <div className="adm-topbar__right">
              <button
                type="button"
                className="adm-cmdk"
                onClick={() => setPalette(true)}
                aria-keyshortcuts="Control+K Meta+K"
                aria-label="Search or jump to a page"
              >
                <SearchIcon size={16} />
                <span className="adm-cmdk__text" aria-hidden="true">
                  Search or jump to…
                </span>
                <kbd aria-hidden="true">{IS_MAC ? "⌘K" : "Ctrl K"}</kbd>
              </button>
              <ThemeToggle />
              {me ? (
                <AccountMenu me={me} role={roleLabel(me)} onSignOut={onSignOut} signingOut={signingOut} />
              ) : (
                <span className="adm-avatar adm-avatar--btn adm-avatar--pending" aria-hidden="true" />
              )}
            </div>
          </header>
          <main id="main" tabIndex={-1} className="adm-main">
            {state.kind === "loading" && (
              <div className="adm-page" aria-busy="true">
                <PageHead title={shownTitle} />
                <p role="status" className="adm-page__lead">
                  Checking your session…
                </p>
              </div>
            )}
            {state.kind === "error" && (
              <div className="adm-page">
                <PageHead title={shownTitle} />
                <section className="adm-card">
                  <ErrorState message={errorMessage(state.error)} onRetry={load} />
                </section>
              </div>
            )}
            {me && denied && <NoAccess area={product} me={me} />}
            {me && !denied && banner?.(me)}
            {me && !denied && children}
          </main>
        </div>
        {sheet && (
          <Drawer kind="menu" title={`ROAAMM ${product}`} onClose={() => setSheet(false)} closeLabel="Close menu">
            {me && scope?.(me)}
            <nav className="adm-nav" aria-label={`${product} sections`}>
              <NavGroups groups={groups} slug={slug} collapsed={false} onNavigate={() => setSheet(false)} />
            </nav>
          </Drawer>
        )}
        {palette && (
          <Suspense fallback={null}>
            <Palette config={paletteConfig} onClose={() => setPalette(false)} />
          </Suspense>
        )}
      </div>
    </AdminContext.Provider>
  );
}

/** Signed in, but this area is for another role: say so and offer the way home. */
function NoAccess({ area, me }: { area: string; me: Me }) {
  return (
    <div className="adm-page">
      <PageHead title="No access" lead={`The ${area.toLowerCase()} area is not available to your account.`} />
      <section className="adm-card">
        <div className="adm-state" role="alert">
          <span className="adm-state__icon" aria-hidden="true">
            <AlertIcon size={20} />
          </span>
          <p className="adm-state__text">
            You are signed in as {me.isDemo ? "the demo" : "a"} {AREA_OF[me.role]}. This area is for{" "}
            {area === "Admin" ? "admins" : `${area.toLowerCase()}s`}.
          </p>
          <Link href={dashboardPath(me.role)} className="adm-btn adm-btn--primary">
            Go to your home
          </Link>
        </div>
      </section>
    </div>
  );
}
