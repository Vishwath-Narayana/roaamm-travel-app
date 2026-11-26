// The Cmd/Ctrl+K command palette: jump to a page, or search users by name.
// A separate lazy chunk: it loads the first time the palette opens.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { users, type AdminUser } from "../api/admin";
import { navigate } from "../router";
import { PAGES } from "./nav";
import { ChevronIcon, SearchIcon, UsersIcon } from "./icons";
import { useDebounced, useDialogFocus } from "./ui";

type Option = { id: string; label: string; hint: string; href: string; kind: "page" | "user" };

export const USER_SEARCH_DEBOUNCE_MS = 300;

export function Palette({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const labelId = useId();
  const q = useDebounced(text.trim(), USER_SEARCH_DEBOUNCE_MS);
  useDialogFocus(ref, true, onClose);

  useEffect(() => {
    if (q.length < 2) {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    users({ q, size: 6 }, controller.signal)
      .then(
        (p) => {
          if (!controller.signal.aborted) setFound(p.items);
        },
        () => {
          if (!controller.signal.aborted) setFound([]);
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false);
      });
    return () => controller.abort();
  }, [q]);

  const options = useMemo<Option[]>(() => {
    const t = text.trim().toLowerCase();
    const pages = PAGES.filter((p) => !t || p.label.toLowerCase().includes(t)).map<Option>((p) => ({
      id: `page-${p.slug || "overview"}`,
      label: p.label,
      hint: "Page",
      href: p.href,
      kind: "page",
    }));
    const people = found.map<Option>((u) => ({
      id: `user-${u.id}`,
      label: u.displayName,
      hint: `User · ${u.role}`,
      href: `/app/admin/users?q=${encodeURIComponent(u.displayName)}`,
      kind: "user",
    }));
    return [...pages, ...people];
  }, [text, found]);

  useEffect(() => setActive(0), [options.length]);

  function choose(o: Option | undefined) {
    if (!o) return;
    onClose();
    navigate(o.href);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length === 0) return;
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : Math.max(0, options.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active]);
    }
  }

  const activeId = options[active] ? `${listId}-${options[active]!.id}` : undefined;
  return (
    <div className="adm-layer">
      <div className="adm-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className="adm-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
      >
        <h2 id={labelId} className="visually-hidden">
          Go to a page or find a user
        </h2>
        <div className="adm-palette__field">
          <SearchIcon size={16} />
          <input
            className="adm-palette__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Go to a page or find a user by name"
            placeholder="Go to a page or find a user…"
            value={text}
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            data-autofocus
          />
        </div>
        <ul id={listId} role="listbox" aria-label="Results" className="adm-palette__list">
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${listId}-${o.id}`}
              role="option"
              aria-selected={i === active}
              className="adm-palette__option"
              onMouseMove={() => setActive(i)}
              onClick={() => choose(o)}
            >
              {o.kind === "user" ? <UsersIcon size={16} /> : <ChevronIcon size={16} />}
              <span>{o.label}</span>
              <span className="adm-palette__hint">{o.hint}</span>
            </li>
          ))}
        </ul>
        <p className="adm-palette__foot" role="status">
          {searching
            ? "Searching users…"
            : options.length === 0
              ? "No matches."
              : <span className="adm-palette__keys">↑ ↓ to move, Enter to open, Esc to close</span>}
        </p>
      </div>
    </div>
  );
}
