import { Fragment, useId } from "react";
import { Link } from "../router";
import type { NavGroup, NavItem } from "./nav";

/**
 * Navigation groups of an app shell (admin, traveller, guide). Used by the
 * desktop sidebar and the phone menu sheet.
 */
export function NavGroups({
  groups,
  slug,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
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
      {groups.map((g, i) => (
        <Fragment key={g.label}>
          <p className="adm-nav__group" id={`${id}-${i}`}>
            {g.label}
          </p>
          <ul className="adm-nav__list" aria-labelledby={`${id}-${i}`}>
            {g.items?.map(item)}
            {g.soon?.map((s) => (
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
        </Fragment>
      ))}
    </>
  );
}

/** Which accounts this console reads. "Simulated" is said once, in the demo banner. */
export function ScopeChip({ isDemo }: { isDemo: boolean }) {
  return (
    <span className={`adm-scope adm-scope--${isDemo ? "demo" : "real"}`}>
      {isDemo ? "Demo accounts" : "Real accounts"}
    </span>
  );
}
