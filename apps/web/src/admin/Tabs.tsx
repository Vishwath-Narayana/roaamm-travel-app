import { useRef, type KeyboardEvent, type ReactNode } from "react";

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; the panel is labelled by its tab. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  idBase,
}: {
  label: string;
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  idBase: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.value === value);
    const n = tabs.length;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    const v = tabs[next]!.value;
    onChange(v);
    refs.current[v]?.focus();
  }
  return (
    <div className="adm-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[t.value] = el;
          }}
          id={`${idBase}-tab-${t.value}`}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          aria-controls={`${idBase}-panel`}
          tabIndex={t.value === value ? 0 : -1}
          className="adm-tabs__tab"
          onClick={() => onChange(t.value)}
          onKeyDown={onKey}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
