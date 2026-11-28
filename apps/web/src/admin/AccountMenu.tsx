import { useEffect, useId, useRef, useState } from "react";
import type { Me } from "../api/session";
import { Link } from "../router";
import { initials } from "./ui";

/** Initials avatar that opens a small menu with the account and Sign out. */
export function AccountMenu({
  me,
  role,
  onSignOut,
  signingOut,
}: {
  me: Me;
  /** The second line, e.g. "Read-only demo admin" or "Traveller". */
  role: string;
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const name = me.isDemo ? `Demo ${me.role}` : me.displayName;

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    function onDoc(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="adm-menu adm-account" ref={root}>
      <button
        ref={button}
        type="button"
        className="adm-avatar adm-avatar--btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((o) => !o)}
      >
        {initials(name)}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="adm-menu__list adm-menu__list--right"
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Tab") {
              setOpen(false);
              if (e.key === "Escape") button.current?.focus();
            }
          }}
        >
          <p className="adm-menu__info" role="none">
            <strong>{name}</strong>
            <span className="adm-muted">{role}</span>
          </p>
          {!me.isDemo && (
            <Link href="/account" role="menuitem" className="adm-menu__item" onClick={() => setOpen(false)}>
              Account and passkeys
            </Link>
          )}
          <button ref={item} type="button" role="menuitem" className="adm-menu__item" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
