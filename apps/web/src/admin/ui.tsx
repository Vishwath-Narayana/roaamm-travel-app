// Building blocks shared by every admin screen: data loading, pills and chips,
// loading/empty/error states, paging, search and the side drawer.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ApiFailure, errorMessage, type ApiError } from "../api/session";
import { STATUS_TEXT } from "../api/admin";
import { CloseIcon, SearchIcon } from "../components/icons";
import { useAdmin } from "./context";
import { AlertIcon, InboxIcon } from "./icons";

// ---- data

export type Load<T> =
  | { kind: "loading"; data?: T }
  | { kind: "ready"; data: T }
  | { kind: "error"; message: string; data?: T };

/** Plain words for an admin API failure. 401 never gets here: it signs the admin out. */
export function adminErrorMessage(error: ApiError): string {
  if (error.kind === "rate_limited") return "Slow down, try again in a moment.";
  if (error.kind === "rejected" && error.code === "forbidden") return "Not allowed.";
  if (error.kind === "rejected" && error.code === "read_only_demo") return "The demo is read-only.";
  if (error.kind === "rejected" && error.code === "not_found")
    return "Not found. It may have been removed, or it belongs to the other scope.";
  if (error.kind === "rejected" && error.code === "already_decided")
    return "Already decided by someone else. The list has been refreshed.";
  return errorMessage(error);
}

/** Turns any thrown value into an ApiError, signing out on 401. */
export function useApiError(): (e: unknown) => ApiError {
  const { onSignedOut } = useAdmin();
  return useCallback(
    (e: unknown) => {
      const error: ApiError = e instanceof ApiFailure ? e.error : { kind: "unavailable" };
      if (error.kind === "unauthenticated") onSignedOut();
      return error;
    },
    [onSignedOut],
  );
}

/**
 * Loads data for a screen. Re-runs when `key` changes; aborts the request in
 * flight when the key changes or the screen unmounts. Keeps the previous data
 * while reloading, so the layout does not jump.
 */
export function useAdminData<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  const toError = useApiError();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ kind: "loading", data: s.data }));
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ kind: "ready", data });
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        const error = toError(e);
        if (error.kind === "unauthenticated") return;
        setState((s) => ({ kind: "error", message: adminErrorMessage(error), data: s.data }));
      },
    );
    return () => controller.abort();
  }, [key, nonce, toError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}

/** The value after it has stopped changing for `ms` (search boxes use 300 ms). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---- labels

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const fmtDate = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const fmtDateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
/** A calendar date (2026-05-01) shown without any timezone shift. */
export const fmtDay = (day: string) => dateFmt.format(new Date(`${day}T12:00:00Z`));

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

// ---- pills and chips (status always has text; colour is only a hint)

export function Pill({ status }: { status: string }) {
  return (
    <span className={`adm-pill adm-pill--${status}`}>
      <span className="adm-pill__dot" aria-hidden="true" />
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export type ChipTone = "neutral" | "info" | "good" | "warn" | "bad" | "sample";

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`adm-chip adm-chip--${tone}`}>{children}</span>;
}

export function SampleChip() {
  return <Chip tone="sample">Sample</Chip>;
}

// ---- states

/** Placeholder rows the same height as real ones, so nothing shifts when data arrives. */
export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="adm-skeleton-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span className="adm-skeleton" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="adm-skeleton-block" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="adm-skeleton" />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="adm-state" role="status">
      <InboxIcon size={20} />
      <p>{children}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="adm-state adm-state--error" role="alert">
      <AlertIcon size={20} />
      <p>{message}</p>
      <button type="button" className="adm-btn adm-btn--secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/** Status line for screen readers while a list loads. */
export function Loading({ what }: { what: string }) {
  return (
    <p className="visually-hidden" role="status">
      Loading {what}…
    </p>
  );
}

export function ReadOnlyBanner() {
  return (
    <p className="adm-readonly" role="note">
      <strong>Demo is read-only.</strong> Everything here is simulated sample data. You can look
      around; approving, rejecting and moving items are disabled.
    </p>
  );
}

// ---- inputs

export function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="adm-search">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <SearchIcon size={16} aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        maxLength={40}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

export function Pager({
  page,
  hasMore,
  total,
  size,
  shown,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  total?: number | null;
  size: number;
  shown: number;
  onPage: (p: number) => void;
}) {
  const from = shown === 0 ? 0 : page * size + 1;
  const to = page * size + shown;
  return (
    <nav className="adm-pager" aria-label="Pages">
      <p className="adm-pager__info">
        {shown === 0 ? "No rows" : `Showing ${from}–${to}`}
        {total != null && ` of ${total}`}
      </p>
      <div className="adm-pager__buttons">
        <button type="button" className="adm-btn adm-btn--secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="adm-pager__page" aria-current="page">
          Page {page + 1}
        </span>
        <button type="button" className="adm-btn adm-btn--secondary" disabled={!hasMore} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="adm-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="adm-seg__btn"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- focus management

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while active, closes on Escape, and gives focus back
 * to whatever had it before when the dialog closes.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, [active, ref]);
}

/** A side drawer dialog. Linkable: the caller opens it from a ?id= query param. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(ref, true, onClose);
  return (
    <div className="adm-drawer-layer">
      <div className="adm-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="adm-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="adm-drawer__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close details">
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="adm-drawer__body">{children}</div>
      </div>
    </div>
  );
}

// ---- timeline

export type Step = {
  label: string;
  /** done: happened. current: where it is now. skipped: never happened (decided directly). todo: not yet. */
  state: "done" | "current" | "skipped" | "todo";
  at?: string | null;
  detail?: ReactNode;
  tone?: "good" | "bad";
};

/** A vertical timeline: dashed line, the current step in the accent colour. */
export function Timeline({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="adm-timeline" aria-label={label}>
      {steps.map((s, i) => (
        <li key={i} className={`adm-timeline__step adm-timeline__step--${s.state}`} data-tone={s.tone}>
          <span className="adm-timeline__dot" aria-hidden="true" />
          <div className="adm-timeline__text">
            <p className="adm-timeline__label">
              {s.label}
              <span className="visually-hidden">
                {s.state === "current" ? " (current step)" : s.state === "skipped" ? " (skipped)" : s.state === "todo" ? " (not yet)" : ""}
              </span>
            </p>
            {s.at && <p className="adm-timeline__at">{fmtDateTime(s.at)}</p>}
            {s.detail && <div className="adm-timeline__detail">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
