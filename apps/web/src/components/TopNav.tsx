import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useRoute } from "../router";
import { currentTheme, onSystemThemeChange, setTheme, type Theme } from "../theme";
import { Button } from "./Button";
import { CloseIcon, MarkIcon, MenuIcon, MoonIcon, SunIcon } from "./icons";
import "./TopNav.css";

export const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#safety", label: "Safety" },
  { href: "/#guides", label: "Guides" },
] as const;

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
      onClick={() => {
        setTheme(next);
        setState(next);
      }}
    >
      {theme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  );
}

export function TopNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const path = useRoute();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  // Close the menu when the route changes.
  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <header className="topnav">
      <div className="topnav__bar container">
        <Link href="/" className="wordmark" aria-label="ROAAMM home">
          <MarkIcon size={22} />
          <span aria-hidden="true">ROAAMM</span>
        </Link>

        <nav aria-label="Primary" className="topnav__links">
          <ul>
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="topnav__link">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="topnav__actions">
          <ThemeToggle />
          <Button href="/demo" className="topnav__cta">
            Try demo
          </Button>
          <button
            ref={toggleRef}
            type="button"
            className="icon-btn topnav__menu-btn"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <CloseIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        aria-label="Mobile"
        className="topnav__mobile container"
        hidden={!open}
      >
        <ul>
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="topnav__mobile-link" onClick={() => close(false)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <Button href="/demo" size="lg" className="topnav__mobile-cta">
          Try demo
        </Button>
      </nav>
    </header>
  );
}
