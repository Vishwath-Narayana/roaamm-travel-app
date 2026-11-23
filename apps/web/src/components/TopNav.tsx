import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { dashboardPath, refreshSession, sessionStore, signOut, type Me } from "../api/session";
import { Link, navigate, useRoute } from "../router";
import { currentTheme, onSystemThemeChange, setTheme, type Theme } from "../theme";
import { Button } from "./Button";
import { CloseIcon, MarkIcon, MenuIcon, MoonIcon, SunIcon } from "./icons";
import { prefersReducedMotion } from "../motion";
import { themeTransition } from "../viewTransition";
import { useOptionalToast } from "./Toast";
import "./TopNav.css";

export const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#safety", label: "Safety" },
  { href: "/#guides", label: "Guides" },
] as const;

/** Who is signed in, for the header. Asks the API only if this browser signed in before. */
function useHeaderSession(): Me | null {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
  useEffect(() => {
    void refreshSession();
  }, []);
  return session.kind === "signed-in" ? session.me : null;
}

function useSignOut(after?: () => void) {
  const toast = useOptionalToast();
  return async () => {
    after?.();
    try {
      await signOut();
      navigate("/demo?session=signed-out");
    } catch {
      toast?.show("Couldn't reach the API to sign out. Try again in a moment.");
    }
  };
}

function ThemeToggle() {
  const [theme, setState] = useState<Theme>(currentTheme);

  // Keep the label right if the OS scheme changes and no explicit choice exists.
  useEffect(() => onSystemThemeChange(() => setState(currentTheme())), []);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`Switch to ${next} theme`}
      onClick={(e) => {
        const button = e.currentTarget;
        themeTransition(button, () => {
          setTheme(next);
          setState(next);
        });
      }}
    >
      <span className="icon-swap" aria-hidden="true">
        <SunIcon size={20} data-on={theme === "dark"} />
        <MoonIcon size={20} data-on={theme !== "dark"} />
      </span>
    </button>
  );
}

type TopNavProps = {
  /** Landing page: float transparently over the hero photo until the page scrolls. */
  overlay?: boolean;
};

/** Section ids the in-page links point at, in page order. */
const SECTION_IDS = NAV_LINKS.map((l) => l.href.split("#")[1]);
/** A section counts as "current" once its top passes this share of the viewport. */
const SPY_LINE = 0.35;

/** Exits are shorter than entrances (docs/motion.md). */
const MENU_CLOSE_MS = 170;

export function TopNav({ overlay = false }: TopNavProps) {
  // closed -> open -> closing -> closed: "closing" keeps the menu mounted while
  // its circle shrinks back into the button.
  const [menu, setMenu] = useState<"closed" | "open" | "closing">("closed");
  const open = menu === "open";
  const [scrolled, setScrolled] = useState(false); // past the hero: solid pill
  const [hidden, setHidden] = useState(false); // scrolling down: slide away
  const [active, setActive] = useState<string | null>(null); // section in view
  const headerRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const indicatorRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const path = useRoute();

  const close = useCallback((returnFocus: boolean) => {
    window.clearTimeout(closeTimer.current);
    if (prefersReducedMotion()) setMenu("closed");
    else {
      setMenu((m) => (m === "closed" ? m : "closing"));
      closeTimer.current = window.setTimeout(() => setMenu("closed"), MENU_CLOSE_MS);
    }
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  function toggleMenu() {
    if (open) close(false);
    else {
      window.clearTimeout(closeTimer.current);
      setMenu("open");
    }
  }

  // Close the menu when the route changes.
  useEffect(() => {
    window.clearTimeout(closeTimer.current);
    setMenu("closed");
  }, [path]);

  useEffect(() => {
    let last = window.scrollY;
    let queued = false;
    const measure = () => {
      queued = false;
      const y = window.scrollY;
      if (overlay) {
        // Clear over the hero photo, solid once the hero has scrolled away.
        const hero = document.querySelector(".hero");
        const limit = hero ? hero.getBoundingClientRect().height - 96 : 24;
        setScrolled(y > limit);
      }
      // Hide when scrolling down, show again on the way up. Never hide near
      // the top or while keyboard focus is inside the nav.
      const focusInside = headerRef.current?.contains(document.activeElement) ?? false;
      if (y < 120 || focusInside) setHidden(false);
      else if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;

      // Scroll spy: the last section whose top has passed the line, while its
      // bottom is still below it.
      let current: string | null = null;
      const line = window.innerHeight * SPY_LINE;
      for (const id of SECTION_IDS) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top <= line && r.bottom > line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overlay, path]);

  // Slide the single indicator to the active link: a full-width pill revealed
  // with clip-path, so its rounded ends never stretch.
  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = indicatorRef.current;
    if (!list || !pill) return;
    const place = () => {
      const link = active ? list.querySelector<HTMLElement>(`a[href="/#${active}"]`) : null;
      if (!link) {
        pill.dataset.on = "false";
        return;
      }
      const box = list.getBoundingClientRect();
      const r = link.getBoundingClientRect();
      const left = Math.round(r.left - box.left);
      const right = Math.round(box.right - r.right);
      pill.style.clipPath = `inset(0 ${right}px 0 ${left}px round 999px)`;
      pill.dataset.on = "true";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Keep Tab inside the open menu (the toggle button plus the menu's links).
  function trapFocus(e: ReactKeyboardEvent<HTMLElement>) {
    if (!open || e.key !== "Tab" || !menuRef.current || !toggleRef.current) return;
    const items = [
      toggleRef.current,
      ...menuRef.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"),
    ];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    const next = e.shiftKey
      ? i === 0
        ? items.length - 1
        : i - 1
      : i === items.length - 1
        ? 0
        : i + 1;
    e.preventDefault();
    items[next].focus();
  }

  const me = useHeaderSession();
  const onSignOut = useSignOut(() => close(false));
  const who = me ? (me.isDemo ? `Demo ${me.role}` : me.displayName) : "";

  return (
    <header
      ref={headerRef}
      className={[
        "topnav",
        overlay && !scrolled && menu === "closed" ? "topnav--clear" : "topnav--solid",
        hidden && menu === "closed" && "topnav--hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      onFocus={() => setHidden(false)}
      onKeyDown={trapFocus}
    >
      <div className="topnav__bar">
        <Link href="/" className="wordmark" aria-label="ROAAMM home">
          <MarkIcon size={22} />
          <span aria-hidden="true">ROAAMM</span>
        </Link>

        <nav aria-label="Primary" className="topnav__links">
          <ul ref={listRef}>
            <li
              ref={indicatorRef}
              className="topnav__indicator"
              aria-hidden="true"
              data-on="false"
            />
            {NAV_LINKS.map((l) => {
              const id = l.href.split("#")[1];
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="topnav__link"
                    aria-current={active === id ? "true" : undefined}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="topnav__actions">
          <ThemeToggle />
          {me ? (
            <>
              <span className="topnav__who" title={who}>
                {who}
              </span>
              <Button href={dashboardPath(me.role)} className="topnav__cta">
                Dashboard
              </Button>
              {!me.isDemo && (
                <Link href="/account" className="topnav__text-link">
                  Account
                </Link>
              )}
              <button
                type="button"
                className="topnav__text-link topnav__signout"
                onClick={onSignOut}
              >
                Sign out
              </button>
            </>
          ) : (
            <Button href="/demo" className="topnav__cta">
              Try demo
            </Button>
          )}
          <button
            ref={toggleRef}
            type="button"
            className="icon-btn topnav__menu-btn"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={toggleMenu}
          >
            <span className="icon-swap" aria-hidden="true">
              <MenuIcon size={20} data-on={!open} />
              <CloseIcon size={20} data-on={open} />
            </span>
          </button>
        </div>
      </div>

      <nav
        ref={menuRef}
        id={menuId}
        aria-label="Mobile"
        className="topnav__mobile"
        data-state={menu}
        hidden={menu === "closed"}
      >
        <ul>
          {NAV_LINKS.map((l, i) => (
            <li key={l.href} style={{ "--i": i } as React.CSSProperties}>
              <Link href={l.href} className="topnav__mobile-link" onClick={() => close(false)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        {me ? (
          <div className="topnav__mobile-session">
            <p className="topnav__mobile-who">Signed in as {who}</p>
            <Button
              href={dashboardPath(me.role)}
              size="lg"
              className="topnav__mobile-cta"
              onClick={() => close(false)}
            >
              Dashboard
            </Button>
            {!me.isDemo && (
              <Link href="/account" className="topnav__mobile-link" onClick={() => close(false)}>
                Account
              </Link>
            )}
            <button
              type="button"
              className="topnav__mobile-link topnav__signout"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Button href="/demo" size="lg" className="topnav__mobile-cta">
            Try demo
          </Button>
        )}
      </nav>
    </header>
  );
}
