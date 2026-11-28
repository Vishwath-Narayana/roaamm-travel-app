// Building blocks shared by every admin screen: data loading, labels, pills and
// chips, states, the one table component, paging, search, and the drawer that
// becomes a bottom sheet on phones. Values come from tokens (docs/design-system.md).
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ApiFailure, errorMessage, type ApiError } from "../api/session";
import { STATUS_TEXT } from "../api/admin";
import { useAdmin } from "./context";
import { AlertIcon, CheckIcon, ChevronIcon, CloseIcon, InboxIcon, InfoIcon, SearchIcon, SortIcon } from "./icons";

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

// ---- media

const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True while `query` matches. False where matchMedia does not exist (tests). */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!hasMatchMedia()) return () => {};
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => hasMatchMedia() && window.matchMedia(query).matches, () => false);
}

/** Phones (below 768 px) get list rows and bottom sheets instead of tables and drawers. */
export const PHONE_QUERY = "(max-width: 767px)";
export const useIsPhone = () => useMedia(PHONE_QUERY);
/** Low-priority table columns (`wide`) exist from 1280 px up. */
export const WIDE_QUERY = "(min-width: 1280px)";

// ---- labels

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export const fmtDate = (iso?: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const fmtDateTime = (iso?: string | null) => (iso ? dateTimeFmt.format(new Date(iso)) : "—");
export const fmtTime = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : "");
/** A calendar date (2026-05-01) shown without any timezone shift. */
export const fmtDay = (day: string) => dateFmt.format(new Date(`${day}T12:00:00Z`));

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function relTime(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return fmtDate(iso);
}

/**
 * Display only: sample rows carry a "Sample:" prefix in the database, and the
 * demo banner already says every row is simulated. The stored text is never changed.
 */
export function cleanTitle(title: string): string {
  const t = title.replace(/^Sample:\s*/i, "");
  return t === title ? title : t.charAt(0).toUpperCase() + t.slice(1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

// ---- unavailable controls (read-only demo, final decisions)

/**
 * Props for a control that stays visible but cannot be used: it keeps focus,
 * says why on hover (title), keyboard focus and tap (data-tip, opened by the
 * shell's click handler), and ignores activation.
 */
export function unavailable(reason: string | null | undefined) {
  if (!reason) return {};
  return {
    "aria-disabled": true as const,
    title: reason,
    "data-tip": reason,
    onClickCapture: (e: ReactMouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

// ---- pills, chips and badges (status always has text; colour is only a hint)

export function Pill({ status }: { status: string }) {
  return (
    <span className={`adm-pill adm-pill--${status}`}>
      <span className="adm-pill__dot" aria-hidden="true" />
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

export type ChipTone = "neutral" | "info" | "good" | "warn" | "bad" | "review" | "sample";

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={`adm-chip adm-chip--${tone}`}>{children}</span>;
}

/**
 * Verified or not, without a chip: a 16 px check in the success colour, or a
 * muted dash. Both carry their meaning as an accessible name; `text` also
 * shows it (drawer facts).
 */
export function VerifiedMark({ verified, text }: { verified: boolean; text?: boolean }) {
  const label = verified ? "Verified" : "Not verified";
  return (
    <span className={`adm-verified${verified ? "" : " adm-verified--no"}`} role="img" aria-label={label}>
      {verified ? <CheckIcon size={16} aria-hidden="true" /> : <span aria-hidden="true">—</span>}
      {text && <span aria-hidden="true">{label}</span>}
    </span>
  );
}

export function Count({ n }: { n: number | null | undefined }) {
  return <span className="adm-count">{n ?? "–"}</span>;
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
      <span className="adm-state__icon" aria-hidden="true">
        <InboxIcon size={20} />
      </span>
      <p className="adm-state__text">{children}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="adm-state adm-state--error" role="alert">
      <span className="adm-state__icon" aria-hidden="true">
        <AlertIcon size={20} />
      </span>
      <p className="adm-state__text">{message}</p>
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

/** The one page-level read-only indicator (the demo accounts, an admin viewing as a traveller). */
export function DemoBanner({
  title = "Demo, read-only.",
  text = "Everything here is simulated sample data; actions are shown but disabled.",
  short = "Read-only demo",
}: {
  title?: string;
  text?: string;
  short?: string;
}) {
  return (
    <p className="adm-banner" role="note">
      <InfoIcon size={16} className="adm-banner__icon" />
      <span className="adm-banner__long">
        <strong>{title}</strong> {text}
      </span>
      <span className="adm-banner__short" aria-hidden="true">
        <strong>{short}</strong> · simulated data
      </span>
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
  return (
    <label className="adm-search">
      <SearchIcon size={16} />
      <span className="visually-hidden">{label}</span>
      <input
        type="search"
        value={value}
        maxLength={40}
        placeholder={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </label>
  );
}

/**
 * One row of filters. On narrow screens it scrolls sideways, fades an edge
 * only while there is more to see on that side, and keeps the selected option
 * in view (on first render and whenever the selection changes).
 */
export function Scroller({ children, label }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef<Element | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const start = el.scrollLeft > 1;
      const end = max - el.scrollLeft > 1;
      el.dataset.fade = start && end ? "both" : start ? "start" : end ? "end" : "none";
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  // Bring the selected option into view without scrolling the page.
  useLayoutEffect(() => {
    const el = ref.current;
    const sel = el?.querySelector('[aria-pressed="true"], [aria-selected="true"]');
    if (!el || !sel || sel === shown.current) return;
    shown.current = sel;
    if (el.scrollWidth <= el.clientWidth) return;
    const box = el.getBoundingClientRect();
    const r = sel.getBoundingClientRect();
    const pad = r.width / 2;
    if (r.left < box.left) el.scrollLeft += r.left - box.left - pad;
    else if (r.right > box.right) el.scrollLeft += r.right - box.right + pad;
  });

  return (
    <div ref={ref} className="adm-scroller" data-scroll="x" aria-label={label} role={label ? "group" : undefined}>
      {children}
    </div>
  );
}

export function Pager({
  page,
  hasMore,
  total,
  size,
  shown,
  noun,
  onPage,
}: {
  page: number;
  hasMore: boolean;
  total?: number | null;
  size: number;
  shown: number;
  /** [singular, plural], e.g. ["user", "users"]. */
  noun: [string, string];
  onPage: (p: number) => void;
}) {
  const from = page * size + 1;
  const to = page * size + shown;
  const n = (k: number) => `${k} ${k === 1 ? noun[0] : noun[1]}`;
  const info =
    shown === 0 && page === 0 ? n(0) : total != null ? `${from}–${to} of ${n(total)}` : `${from}–${to} ${noun[1]}`;
  const single = page === 0 && !hasMore;
  return (
    <nav className="adm-pager" aria-label="Pages">
      <p className="adm-pager__info">{info}</p>
      {!single && (
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
      )}
    </nav>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  fill,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  /** The board's column tabs on small screens: the label over its count. */
  fill?: boolean;
}) {
  return (
    <div className={`adm-seg${fill ? " adm-seg--fill" : ""}`} role="group" aria-label={label}>
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

// ---- the one table component

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * The column's share of the table width (the screen's column template).
   * Shares are relative: the visible columns split the width left after the
   * fixed checkbox, action and chevron columns. "action" is one icon button.
   */
  size: number | "action";
  /** The row header: holds the open button; long text ends in an ellipsis. */
  primary?: boolean;
  /** Low priority: rendered only from 1280 px, so the table never scrolls sideways. */
  wide?: boolean;
  /** Right-aligned (numbers, dates at the end). */
  end?: boolean;
  sort?: { active: boolean; dir: "asc" | "desc"; onSort: () => void };
};

/**
 * A phone list row. Line 1: the title, which gets the whole line (and an
 * optional `aside`, such as a time). Line 2: the pill, then at most two meta items.
 */
export type PhoneRow = { title: ReactNode; aside?: ReactNode; pill?: ReactNode; meta: ReactNode[] };

export type Selection<T> = {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** null when the row can be selected, otherwise why not (shown as a tooltip). */
  blocked: (row: T) => string | null;
  allLabel: string;
  rowLabel: (row: T) => string;
};

function SortButton({ label, sort }: { label: ReactNode; sort: NonNullable<Column<unknown>["sort"]> }) {
  return (
    <button type="button" className="adm-sort" onClick={sort.onSort} data-active={sort.active}>
      {label}
      <SortIcon size={16} />
      {sort.active && <span className="visually-hidden">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span>}
    </button>
  );
}

const IGNORE_ROW_CLICK = 'input, a, .adm-check, .adm-menu, [role="menu"], button:not(.adm-rowlink)';

const colClass = <T,>(c: Column<T>) =>
  [c.primary && "adm-col--primary", c.end && "adm-col--end", c.size === "action" && "adm-col--action"].filter(Boolean).join(" ") || undefined;

/**
 * Every admin list. Desktop and tablet: a table with one fixed column
 * template per screen (table-layout: fixed and a <colgroup>), so no header
 * moves when a tab, filter, page or the data changes. Header 40 px, rows
 * 48 px, the first column starts at the card padding. Phone: two-line list
 * rows. Rows that open something get a hover fill, a pointer cursor and a
 * chevron.
 */
export function DataTable<T extends { id: string }>({
  caption,
  columns: allColumns,
  rows,
  busy,
  onOpen,
  phone,
  selection,
  checkColumn = false,
  empty,
  skeleton = 6,
}: {
  caption: string;
  columns: Column<T>[];
  /** undefined until the first page arrives (skeleton rows meanwhile). */
  rows: T[] | undefined;
  busy: boolean;
  onOpen?: (row: T) => void;
  phone: (row: T) => PhoneRow;
  selection?: Selection<T>;
  /**
   * Reserve the checkbox column even while `selection` is off (a tab without
   * bulk actions on a screen that has them), so the columns never move.
   */
  checkColumn?: boolean;
  empty: ReactNode;
  skeleton?: number;
}) {
  const isPhone = useIsPhone();
  const wide = useMedia(WIDE_QUERY);
  const loaded = rows !== undefined;
  const list = rows ?? [];

  if (isPhone) {
    return (
      <>
        <ul className="adm-list" aria-label={caption} aria-busy={busy}>
          {!loaded &&
            Array.from({ length: skeleton }, (_, i) => (
              <li key={i} className="adm-row adm-row--skeleton" aria-hidden="true">
                <span className="adm-skeleton" />
                <span className="adm-skeleton" />
              </li>
            ))}
          {list.map((r) => {
            const p = phone(r);
            const body = (
              <>
                <span className="adm-row__main">
                  <span className="adm-row__line1">
                    <span className="adm-row__title">{p.title}</span>
                    {p.aside}
                  </span>
                  <span className="adm-row__line2">
                    {p.pill}
                    {p.meta.slice(0, 2).map((m, i) => (
                      <Fragment key={i}>
                        {i > 0 && (
                          <span className="adm-row__sep" aria-hidden="true">
                            ·
                          </span>
                        )}
                        <span className="adm-row__meta">{m}</span>
                      </Fragment>
                    ))}
                  </span>
                </span>
                {onOpen && <ChevronIcon size={16} className="adm-row__chev" />}
              </>
            );
            return (
              <li key={r.id}>
                {onOpen ? (
                  <button type="button" className="adm-row" onClick={() => onOpen(r)}>
                    {body}
                  </button>
                ) : (
                  <div className="adm-row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {loaded && list.length === 0 && <Empty>{empty}</Empty>}
      </>
    );
  }

  const columns = allColumns.filter((c) => wide || !c.wide);
  const shares = columns.reduce((n, c) => n + (c.size === "action" ? 0 : c.size), 0);
  const hasCheck = Boolean(selection) || checkColumn;
  const selectable = selection ? list.filter((r) => !selection.blocked(r)) : [];
  const allSelected = selectable.length > 0 && selectable.every((r) => selection!.selected.has(r.id));
  const headReason = selection && selectable.length === 0 ? (list[0] ? selection.blocked(list[0]) : "Nothing to select") : null;
  const toggle = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };
  const cols = columns.length + (hasCheck ? 1 : 0) + (onOpen ? 1 : 0);

  return (
    <div className="adm-table-wrap">
      <table className="adm-table" aria-busy={busy} data-openable={onOpen ? "true" : undefined}>
        <caption className="visually-hidden">{caption}</caption>
        <colgroup>
          {hasCheck && <col className="adm-table__col-check" />}
          {columns.map((c) =>
            c.size === "action" ? (
              <col key={c.key} className="adm-table__col-action" />
            ) : (
              <col key={c.key} style={{ width: `${((c.size / shares) * 100).toFixed(3)}%` }} />
            ),
          )}
          {onOpen && <col className="adm-table__col-chev" />}
        </colgroup>
        <thead>
          <tr>
            {hasCheck &&
              (selection ? (
                <th scope="col" className="adm-table__check">
                  <span className="adm-check" data-tip={headReason ?? undefined}>
                    <input
                      type="checkbox"
                      aria-label={selection.allLabel}
                      checked={allSelected}
                      onChange={() => selection.onChange(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))}
                      {...unavailable(headReason)}
                    />
                  </span>
                </th>
              ) : (
                <td className="adm-table__check" />
              ))}
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={colClass(c)}
                aria-sort={c.sort ? (c.sort.active ? (c.sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
              >
                {c.sort ? <SortButton label={c.header} sort={c.sort} /> : c.header}
              </th>
            ))}
            {onOpen && (
              <th scope="col" className="adm-table__chev">
                <span className="visually-hidden">Open</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {!loaded && <SkeletonRows rows={skeleton} cols={cols} />}
          {list.map((r) => {
            const isSelected = selection?.selected.has(r.id) ?? false;
            const reason = selection?.blocked(r) ?? null;
            return (
              <tr
                key={r.id}
                aria-selected={selection ? isSelected : undefined}
                className={isSelected ? "is-selected" : undefined}
                onClick={
                  onOpen
                    ? (e) => {
                        if ((e.target as Element).closest(IGNORE_ROW_CLICK)) return;
                        onOpen(r);
                      }
                    : undefined
                }
              >
                {hasCheck &&
                  (selection ? (
                    <td className="adm-table__check">
                      <span className="adm-check" data-tip={reason ?? undefined}>
                        <input
                          type="checkbox"
                          aria-label={selection.rowLabel(r)}
                          checked={isSelected}
                          onChange={() => toggle(r.id)}
                          {...unavailable(reason)}
                        />
                      </span>
                    </td>
                  ) : (
                    <td className="adm-table__check" />
                  ))}
                {columns.map((c) => {
                  const cls = colClass(c);
                  if (c.primary) {
                    return (
                      <th key={c.key} scope="row" className={cls}>
                        <div className="adm-cell">
                          {onOpen ? (
                            <button type="button" className="adm-rowlink">
                              {c.cell(r)}
                            </button>
                          ) : (
                            c.cell(r)
                          )}
                        </div>
                      </th>
                    );
                  }
                  return (
                    <td key={c.key} className={cls}>
                      {c.cell(r)}
                    </td>
                  );
                })}
                {onOpen && (
                  <td className="adm-table__chev" aria-hidden="true">
                    <ChevronIcon size={16} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loaded && list.length === 0 && <Empty>{empty}</Empty>}
    </div>
  );
}

// ---- focus management

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Moves focus into `ref`, keeps Tab inside it while active, closes on Escape,
 * and gives focus back to whatever had it before when the dialog closes.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    const node = ref.current;
    // The marked field (palette input, a reject note) or else the dialog itself:
    // Tab then moves straight into it, and nothing shows a ring before it is used.
    const first = node?.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? (node?.hasAttribute("tabindex") ? node : node?.querySelector<HTMLElement>(FOCUSABLE)))?.focus();
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

/** Pull the sheet down past this many px to close it (phone only). */
const DRAG_CLOSE_PX = 96;

/** Drag-down-to-close for the phone bottom sheet. Desktop drawers ignore it. */
function useDragToClose(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const start = useRef<number | null>(null);
  const isPhone = useIsPhone();
  const onPointerDown = (e: ReactPointerEvent) => {
    if (!isPhone || (e.target as Element).closest("button, a, input, textarea")) return;
    start.current = e.clientY;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (start.current === null || !panel.current) return;
    const dy = Math.max(0, e.clientY - start.current);
    panel.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (start.current === null || !panel.current) return;
    const dy = e.clientY - start.current;
    start.current = null;
    panel.current.style.transform = "";
    if (dy > DRAG_CLOSE_PX) onClose();
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

/**
 * The summary at the top of a detail drawer: who or what, an optional
 * subtitle (who it belongs to), its status, and two or three key facts. A
 * `wide` fact (long dates) takes a row of its own above the others.
 */
export type Summary = {
  /** An avatar or an icon, 40 px. */
  lead: ReactNode;
  subtitle?: ReactNode;
  pill?: ReactNode;
  facts: [label: string, value: ReactNode, wide?: "wide"][];
};

/** A 40 px round icon for a drawer summary (things without a person: trips, applications). */
export function SummaryIcon({ children }: { children: ReactNode }) {
  return (
    <span className="adm-summary__icon" aria-hidden="true">
      {children}
    </span>
  );
}

/**
 * The detail drawer (desktop and tablet: a 480 px panel on the right) that is
 * a bottom sheet on phones, with a drag handle: full height with a sticky
 * action bar when it has a `footer`, content height (at most 85%) without.
 * `kind="menu"` is the phone navigation sheet.
 * With a `summary`, the bar shows `label` (what kind of thing this is) and the
 * body opens with the summary, whose heading (`title`) names the dialog.
 * Linkable: callers open it from a ?id= query parameter.
 */
export function Drawer({
  title,
  label,
  summary,
  onClose,
  children,
  footer,
  footNote,
  kind = "drawer",
  closeLabel = "Close details",
}: {
  title: ReactNode;
  label?: ReactNode;
  summary?: Summary;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** One line above the footer's buttons, e.g. why they are disabled. */
  footNote?: ReactNode;
  kind?: "drawer" | "menu";
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isPhone = useIsPhone();
  useDialogFocus(ref, true, onClose);
  const drag = useDragToClose(ref, onClose);
  // Phone: a sheet without a footer hugs its content (at most 85% of the
  // screen); with a footer it stays full height so the action bar never moves.
  const fit = kind === "menu" || !footer;
  return (
    <div className="adm-layer">
      <div className="adm-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`adm-sheet adm-sheet--${kind}${fit ? " adm-sheet--fit" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="adm-sheet__top" {...(isPhone ? drag : {})}>
          {/* The grabber is rendered on phones only (below 768 px), where the
              sheet can be dragged down: from 768 px it is not in the DOM at all. */}
          {isPhone && <span className="adm-sheet__handle" aria-hidden="true" />}
          <header className="adm-sheet__head">
            {summary ? (
              <p className="adm-sheet__label">{label ?? title}</p>
            ) : (
              <h2 id={titleId} className="adm-sheet__title">
                {label ?? title}
              </h2>
            )}
            <button type="button" className="adm-icon-btn" onClick={onClose} aria-label={closeLabel}>
              <CloseIcon size={16} />
            </button>
          </header>
        </div>
        <div className="adm-sheet__body">
          {summary && (
            <section className="adm-summary" aria-labelledby={titleId}>
              <div className="adm-summary__top">
                {summary.lead}
                <div className="adm-summary__id">
                  <h2 id={titleId} className="adm-summary__name">
                    {title}
                  </h2>
                  {summary.subtitle && <p className="adm-summary__sub">{summary.subtitle}</p>}
                  {summary.pill}
                </div>
              </div>
              <dl className="adm-summary__facts" data-cols={summary.facts.filter((f) => !f[2]).length}>
                {summary.facts.map(([k, v, wide]) => (
                  <div key={k} className={`adm-summary__fact${wide ? " adm-summary__fact--wide" : ""}`}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {children}
        </div>
        {footer && (
          <div className="adm-sheet__foot">
            {footNote && <p className="adm-sheet__note">{footNote}</p>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A page's title, lead and actions. Exactly one h1 per page at every width:
 * from 768 px it is here; below 768 px the top bar's title is the h1 and this
 * header keeps only the lead (for screen readers below 640 px) and actions.
 */
export function PageHead({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  const isPhone = useIsPhone();
  if (isPhone && !lead && !actions) return null;
  return (
    <header className="adm-page__head" data-bare={!actions || undefined}>
      <div className="adm-page__titles">
        {!isPhone && <h1>{title}</h1>}
        {lead && <p className="adm-page__lead">{lead}</p>}
      </div>
      {actions}
    </header>
  );
}

/** A small uppercase section label inside a drawer. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="adm-label">{children}</h3>;
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

/** A vertical timeline: a marker per step, a solid line through what happened, dashed after. */
export function Timeline({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="adm-timeline" aria-label={label}>
      {steps.map((s, i) => (
        <li key={i} className={`adm-step adm-step--${s.state}`} data-tone={s.tone}>
          <span className="adm-step__mark" aria-hidden="true">
            {s.state === "done" && <CheckIcon size={16} />}
            {s.state === "current" && <span className="adm-step__dot" />}
          </span>
          <div className="adm-step__text">
            <p className="adm-step__label">
              {s.label}
              <span className="visually-hidden">
                {s.state === "current" ? " (current step)" : s.state === "skipped" ? " (skipped)" : s.state === "todo" ? " (not yet)" : ""}
              </span>
            </p>
            {s.detail && <div className="adm-step__detail">{s.detail}</div>}
          </div>
          {s.at && (
            <p className="adm-step__at">
              <time dateTime={s.at}>{fmtDate(s.at)}</time>
              <span>{fmtTime(s.at)}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Stops a click inside a row control from reaching the row (opening the drawer). */
export const stop = (e: ReactMouseEvent | ReactKeyboardEvent) => e.stopPropagation();
