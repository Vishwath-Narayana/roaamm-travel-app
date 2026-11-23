import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { STATUS_TEXT, type AppStatus } from "../api/admin";
import { FINAL_LABEL, READ_ONLY_LABEL } from "./context";
import { MoreIcon } from "./icons";
import { unavailable } from "./ui";

export type MoveTarget = "in_review" | "approved" | "rejected";

/** Where an application can go from its status. Decided applications are final. */
export function moveTargets(status: AppStatus): MoveTarget[] {
  if (status === "submitted") return ["in_review", "approved", "rejected"];
  if (status === "in_review") return ["approved", "rejected"];
  return [];
}

/**
 * A "Move to…" menu button (WAI-ARIA menu button): Enter, Space or ArrowDown
 * opens it, arrow keys move, Escape closes and returns focus. The keyboard
 * way to move a Kanban card; there is no drag and drop.
 */
export function MoveMenu({
  status,
  label,
  readOnly,
  onMove,
}: {
  status: AppStatus;
  label: string;
  readOnly: boolean;
  onMove: (to: MoveTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const targets = moveTargets(status);
  const final = targets.length === 0;

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const root = buttonRef.current?.parentElement;
      if (root && !root.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(e.key === "ArrowUp" ? targets.length - 1 : 0);
      setOpen(true);
    }
  }

  function onMenuKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + targets.length) % targets.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : targets.length - 1);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const reason = final ? FINAL_LABEL : readOnly ? READ_ONLY_LABEL : null;
  return (
    <div className="adm-menu">
      <button
        ref={buttonRef}
        type="button"
        className="adm-btn adm-btn--secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
        onKeyDown={reason ? undefined : onButtonKey}
        {...unavailable(reason)}
      >
        <MoreIcon size={16} />
        <span className="adm-btn__label">{final ? "Decided" : "Move to…"}</span>
        <span className="visually-hidden">: {label}</span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Move ${label} to`} className="adm-menu__list" onKeyDown={onMenuKey}>
          {targets.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              className="adm-menu__item"
              onClick={() => {
                close();
                onMove(t);
              }}
            >
              {STATUS_TEXT[t]}
              {t === "rejected" && "…"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
