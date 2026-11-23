// The admin console (M4b): its own app shell (sidebar + top bar) instead of
// the marketing header and footer. Loaded only by admins, on /app/admin/*.
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
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
import { MarkIcon, MenuIcon, SearchIcon, SidebarIcon } from "./icons";
import { BASE, PAGES, slugOf } from "./nav";
import { NavGroups, ScopeChip } from "./Sidebar";
import { DemoBanner, Drawer, ErrorState, useMedia } from "./ui";
import { Overview } from "./screens/Overview";
import { Verification } from "./screens/Verification";
import { Users } from "./screens/Users";
import { Trips } from "./screens/Trips";
import { Audit } from "./screens/Audit";
import "./admin.css";

// The board and the palette are their own chunks: most visits never need them.
const Guides = lazy(() => import("./screens/Guides").then((m) => ({ default: m.Guides })));
const Palette = lazy(() => import("./Palette").then((m) => ({ default: m.Palette })));

const SCREENS: Record<string, ComponentType> = {
  "": Overview,
  verification: Verification,
  "guide-applications": Guides,
  users: Users,
  trips: Trips,
  audit: Audit,
};

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

type State = { kind: "loading" } | { kind: "ready"; me: Me } | { kind: "error"; error: ApiError };

export function AdminApp({ path }: { path: string }) {
  const slug = slugOf(path);
  const page = PAGES.find((p) => p.slug === slug);
  usePageTitle(page ? `${page.label} · Admin` : "Admin");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const meRef = useRef<Me | null>(null);
  const tablet = useMedia(TABLET);
  const rail = collapsed || tablet;

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

  /** 401: real admins go to the sign-in page; a demo session goes back to the demo page. */
  const onSignedOut = useCallback(() => {
    const wasDemo = meRef.current?.isDemo === true;
    lastRole.set(null);
    clearAdminCache();
    navigate(wasDemo ? "/demo?session=expired" : "/login", { replace: true });
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getMe().then(
      (me) => {
        if (cancelled) return;
        if (me.needsNewPasskey) navigate("/account", { replace: true });
        else if (me.role !== "admin") navigate(dashboardPath(me.role), { replace: true });
        else {
          meRef.current = me;
          setState({ kind: "ready", me });
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

  // Cmd/Ctrl+K opens the palette from anywhere in the console.
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
  const me = state.kind === "ready" ? state.me : null;
  const ctx: AdminContextValue | null = me ? { me, readOnly: me.isDemo, onSignedOut } : null;
  const Screen = slug === null ? null : SCREENS[slug];

  return (
    <AdminContext.Provider value={ctx}>
      <div className="adm" data-collapsed={rail}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <aside className="adm-sidebar" aria-label="Admin">
          <div className="adm-sidebar__inner">
            <div className="adm-sidebar__head">
              <Link href={BASE} className="adm-brand" aria-label="ROAAMM Admin, overview">
                <span className="adm-logo" aria-hidden="true">
                  <MarkIcon size={20} />
                </span>
                <span className="adm-brand__name" aria-hidden="true">
                  ROAAMM <span className="adm-brand__sub">Admin</span>
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
            <div className="adm-sidebar__scope">
              {me ? (
                <ScopeChip isDemo={me.isDemo} />
              ) : (
                <span className="adm-scope adm-scope--pending" aria-hidden="true" />
              )}
            </div>
            <nav className="adm-nav" aria-label="Admin sections">
              <NavGroups slug={slug ?? ""} collapsed={rail} />
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
            <p className="adm-topbar__title" aria-hidden="true">
              {page?.label ?? "Admin"}
            </p>
            <nav aria-label="Breadcrumb" className="adm-crumbs">
              <ol>
                <li>
                  <Link href={BASE}>Admin</Link>
                </li>
                <li aria-current="page">{page?.label ?? "Not found"}</li>
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
                <AccountMenu me={me} onSignOut={onSignOut} signingOut={signingOut} />
              ) : (
                <span
                  className="adm-avatar adm-avatar--btn adm-avatar--pending"
                  aria-hidden="true"
                />
              )}
            </div>
          </header>
          <main id="main" tabIndex={-1} className="adm-main">
            {state.kind === "loading" && (
              <div className="adm-page" aria-busy="true">
                <h1>{page?.label ?? "Admin"}</h1>
                <p role="status" className="adm-page__lead">
                  Checking your session…
                </p>
              </div>
            )}
            {state.kind === "error" && (
              <div className="adm-page">
                <h1>{page?.label ?? "Admin"}</h1>
                <section className="adm-card">
                  <ErrorState message={errorMessage(state.error)} onRetry={load} />
                </section>
              </div>
            )}
            {me && me.isDemo && <DemoBanner />}
            {me &&
              (Screen ? (
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
                  <h1>Page not found</h1>
                  <p>
                    <Link href={BASE} className="adm-link">
                      Back to the overview
                    </Link>
                  </p>
                </div>
              ))}
          </main>
        </div>
        {sheet && (
          <MenuSheet
            slug={slug ?? ""}
            isDemo={me?.isDemo ?? null}
            onClose={() => setSheet(false)}
          />
        )}
        {palette && (
          <Suspense fallback={null}>
            <Palette onClose={() => setPalette(false)} />
          </Suspense>
        )}
      </div>
    </AdminContext.Provider>
  );
}

/** Below 768 px the sidebar becomes this bottom sheet (the drawer's sheet, 44 px rows). */
function MenuSheet({
  slug,
  isDemo,
  onClose,
}: {
  slug: string;
  isDemo: boolean | null;
  onClose: () => void;
}) {
  return (
    <Drawer kind="menu" title="ROAAMM Admin" onClose={onClose} closeLabel="Close menu">
      {isDemo !== null && <ScopeChip isDemo={isDemo} />}
      <nav className="adm-nav" aria-label="Admin sections">
        <NavGroups slug={slug} collapsed={false} onNavigate={onClose} />
      </nav>
    </Drawer>
  );
}
