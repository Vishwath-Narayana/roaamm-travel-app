import { useId } from "react";
import { Link } from "../router";
import { MAIN, RECORDS, SOON, type NavItem } from "./nav";

/** Navigation groups. Used by the desktop sidebar and the phone menu sheet. */
export function NavGroups({
  slug,
  collapsed,
  onNavigate,
}: {
  slug: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const id = useId();
  const item = (n: NavItem) => (
    <li key={n.slug}>
      <Link
        href={n.href}
        className="adm-nav__item"
        aria-current={n.slug === slug ? "page" : undefined}
        title={collapsed ? n.label : undefined}
        onClick={onNavigate}
      >
        <n.icon size={20} />
        <span className="adm-nav__label">{n.label}</span>
      </Link>
    </li>
  );
  return (
    <>
      <p className="adm-nav__group" id={`${id}-main`}>
        Main
      </p>
      <ul className="adm-nav__list" aria-labelledby={`${id}-main`}>
        {MAIN.map(item)}
      </ul>
      <p className="adm-nav__group" id={`${id}-records`}>
        Records
      </p>
      <ul className="adm-nav__list" aria-labelledby={`${id}-records`}>
        {RECORDS.map(item)}
      </ul>
      <p className="adm-nav__group" id={`${id}-soon`}>
        Coming soon
      </p>
      <ul className="adm-nav__list" aria-labelledby={`${id}-soon`}>
        {SOON.map((s) => (
          <li key={s.label}>
            <span className="adm-nav__item adm-nav__item--soon" aria-disabled="true" title={`${s.label}: planned for ${s.milestone}`}>
              <s.icon size={20} />
              <span className="adm-nav__label">
                {s.label}
                <span className="adm-nav__ms">{s.milestone}</span>
              </span>
              <span className="visually-hidden"> (not built yet, planned for {s.milestone})</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ScopeChip({ isDemo }: { isDemo: boolean }) {
  return (
    <span className={`adm-scope adm-scope--${isDemo ? "demo" : "real"}`}>
      {isDemo ? "Demo (simulated)" : "Real accounts"}
    </span>
  );
}
