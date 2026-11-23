import { useEffect, useId, useRef, useState } from "react";
import type { Me } from "../api/session";
import { initials } from "./ui";

/** Initials avatar that opens a small menu with the account and Sign out. */
export function AccountMenu({ me, onSignOut, signingOut }: { me: Me; onSignOut: () => void; signingOut: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const name = me.isDemo ? "Demo admin" : me.displayName;

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
            <span className="adm-muted">{me.isDemo ? "Read-only demo admin" : "Admin"}</span>
          </p>
          <button ref={item} type="button" role="menuitem" className="adm-menu__item" disabled={signingOut} onClick={onSignOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
