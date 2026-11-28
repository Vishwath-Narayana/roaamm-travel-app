// Pieces shared by the traveller and guide apps (M4c). They sit on the admin
// console's building blocks (src/admin/ui.tsx) and tokens, so every area of
// the app looks and behaves the same.
import { cloneElement, useId, useRef, type ReactElement, type ReactNode } from "react";
import { READ_ONLY_LABEL, useAdmin } from "../admin/context";
import { Chip, useAdminData, useDialogFocus } from "../admin/ui";
import { GUIDE_LIMITS, TRIP_LIMITS } from "../api/member";

/** Marks one of the fixed simulated rows (the demo traveller's trips, the demo guide's profile). */
export const SampleChip = () => <Chip tone="sample">Sample</Chip>;

/**
 * Loads the signed-in member's own data. An admin viewing the area has no
 * trips or applications of their own (the API refuses admins), so they get
 * `empty` without a request.
 */
export function useMine<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, empty: T) {
  const { me } = useAdmin();
  const admin = me.role === "admin";
  return useAdminData(`${admin ? "viewas" : "mine"}:${key}`, (s) => (admin ? Promise.resolve(empty) : fetcher(s)));
}

/** Why a write control is unavailable for this viewer, or null if it can be used. */
export function useWriteBlock(): string | null {
  const { me, readOnly } = useAdmin();
  if (me.role === "admin") return "Admins view this area read-only";
  return readOnly ? READ_ONLY_LABEL : null;
}

/**
 * One labelled form control with an optional hint and an inline error under
 * it. The control gets its id, aria-invalid and aria-describedby here.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && (
        <p id={hintId} className="adm-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="adm-field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** After a failed submit: focus the first field marked invalid. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

/** A small centred confirm dialog (Escape or the backdrop cancels). */
export function ConfirmDialog({
  title,
  body,
  confirm,
  cancel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirm: string;
  cancel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useDialogFocus(ref, true, onClose);
  return (
    <div className="adm-layer">
      <div className="adm-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="adm-dialog-wrap">
        <div ref={ref} className="adm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
          <h2 id={titleId}>{title}</h2>
          <div id={bodyId} className="adm-note">
            {body}
          </div>
          <div className="adm-actions">
            <button type="button" className="adm-btn adm-btn--secondary" onClick={onClose} data-autofocus>
              {cancel}
            </button>
            <button type="button" className="adm-btn adm-btn--danger" disabled={busy} onClick={onConfirm}>
              {busy ? "Working…" : confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- validation (the same limits as the API)

export type TripValues = { title: string; destination: string; startDate: string; endDate: string; notes: string };
export type Errors<K extends string> = Partial<Record<K, string>>;

/** ISO date of today shifted by whole years, for the date pickers' min and max. */
export const yearsFromToday = (years: number, today = new Date()) => {
  const d = new Date(Date.UTC(today.getUTCFullYear() + years, today.getUTCMonth(), today.getUTCDate()));
  return d.toISOString().slice(0, 10);
};

/** The API's place rule (PlainText.place): letters, spaces, . ' and -; parts split by commas. */
const PLACE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
export const isPlace = (s: string, commas: number) => {
  const parts = s.split(",").map((p) => p.trim());
  return parts.length <= commas + 1 && parts.every((p) => PLACE.test(p));
};

/** Field errors in plain words, in form order. Empty when the trip can be sent. */
export function checkTrip(v: TripValues, today = new Date()): Errors<keyof TripValues> {
  const e: Errors<keyof TripValues> = {};
  const len = (s: string) => [...s.trim()].length;
  if (!v.title.trim()) e.title = "Give the trip a title.";
  else if (len(v.title) > TRIP_LIMITS.title) e.title = `Use at most ${TRIP_LIMITS.title} characters.`;
  if (!v.destination.trim()) e.destination = "Say where you are going.";
  else if (len(v.destination) > TRIP_LIMITS.destination) e.destination = `Use at most ${TRIP_LIMITS.destination} characters.`;
  else if (!isPlace(v.destination.trim(), 2)) e.destination = CODE_TEXT.invalid_destination;
  if (!v.startDate) e.startDate = "Pick a start date.";
  else if (v.startDate < yearsFromToday(-2, today)) e.startDate = "Pick a date in the last two years or later.";
  if (!v.endDate) e.endDate = "Pick an end date.";
  else if (v.startDate && v.endDate < v.startDate) e.endDate = "The trip cannot end before it starts.";
  else if (v.endDate > yearsFromToday(3, today)) e.endDate = "Pick a date within the next three years.";
  if (len(v.notes) > TRIP_LIMITS.notes) e.notes = `Use at most ${TRIP_LIMITS.notes} characters.`;
  return e;
}

export type ApplicationValues = { headline: string; bio: string; languages: string[]; cities: string[] };

export function checkApplication(v: ApplicationValues): Errors<keyof ApplicationValues> {
  const e: Errors<keyof ApplicationValues> = {};
  const len = (s: string) => [...s.trim()].length;
  if (!v.headline.trim()) e.headline = "Write a one-line headline.";
  else if (len(v.headline) > GUIDE_LIMITS.headline) e.headline = `Use at most ${GUIDE_LIMITS.headline} characters.`;
  if (!v.bio.trim()) e.bio = "Tell travellers about your tours.";
  else if (len(v.bio) > GUIDE_LIMITS.bio) e.bio = `Use at most ${GUIDE_LIMITS.bio} characters.`;
  if (v.languages.length === 0) e.languages = "Add at least one language.";
  else if (v.languages.length > GUIDE_LIMITS.languages) e.languages = `Add at most ${GUIDE_LIMITS.languages} languages.`;
  if (v.cities.length === 0) e.cities = "Add at least one city.";
  else if (v.cities.length > GUIDE_LIMITS.cities) e.cities = `Add at most ${GUIDE_LIMITS.cities} cities.`;
  else if (v.cities.some((c) => len(c) > GUIDE_LIMITS.city)) e.cities = `Each city has at most ${GUIDE_LIMITS.city} characters.`;
  else if (!v.cities.every((c) => isPlace(c, 0))) e.cities = CODE_TEXT.invalid_cities;
  return e;
}

/** The API's field error codes, mapped to the field they belong to. */
export const FIELD_OF_CODE: Record<string, string> = {
  invalid_title: "title",
  invalid_destination: "destination",
  invalid_dates: "endDate",
  invalid_notes: "notes",
  invalid_headline: "headline",
  invalid_bio: "bio",
  invalid_languages: "languages",
  invalid_cities: "cities",
};

export const CODE_TEXT: Record<string, string> = {
  invalid_title: "Use 1 to 80 characters, without < or >.",
  invalid_destination: "Use letters, spaces, dots, apostrophes and hyphens, with up to two commas (Kyoto, Japan).",
  invalid_dates: "Check the dates: the end must not be before the start, within two years back and three ahead.",
  invalid_notes: "Use at most 500 characters, without < or >.",
  invalid_headline: "Use 1 to 80 characters, without < or >.",
  invalid_bio: "Use 1 to 600 characters, without < or >.",
  invalid_languages: "Choose 1 to 5 languages from the list.",
  invalid_cities: "Use city names with letters, spaces, dots, apostrophes and hyphens (no commas).",
  trip_limit_reached: "You have 20 trips, the most an account can hold. Remove one first.",
  already_open: "You already have an open application.",
  already_guide: "You are already a guide.",
  not_verified: "Verify your ID before you apply.",
};
