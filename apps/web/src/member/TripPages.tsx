// One trip: its detail page, and the form that creates or edits it.
// Notes are private to the owner; the API never sends them to anyone else.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { STATUS_TEXT, type TripStatus } from "../api/admin";
import { createTrip, myTrip, TRIP_LIMITS, updateTrip, type Trip } from "../api/member";
import { ApiFailure } from "../api/session";
import { MapIcon } from "../admin/icons";
import {
  Empty,
  ErrorState,
  PageHead,
  Pill,
  SkeletonBlock,
  SummaryIcon,
  adminErrorMessage,
  fmtDate,
  unavailable,
  useApiError,
} from "../admin/ui";
import { useToast } from "../components/Toast";
import { Link, navigate } from "../router";
import {
  CODE_TEXT,
  ConfirmDialog,
  FIELD_OF_CODE,
  Field,
  SampleChip,
  checkTrip,
  focusFirstInvalid,
  useMine,
  useWriteBlock,
  yearsFromToday,
  type Errors,
  type TripValues,
} from "./parts";
import { tripDates } from "./Trips";

const BASE = "/app/traveller/trips";
const PRIVATE = "Private: only you can see your notes. Admins never see them.";

/** Why this trip cannot be changed by this viewer, or null. */
function useTripBlock(t?: Trip): string | null {
  const block = useWriteBlock();
  return block ?? (t?.sample ? "Sample trips cannot be changed" : null);
}

function NotFound() {
  return (
    <section className="adm-card">
      <Empty>
        This trip does not exist, or it is not yours.{" "}
        <Link href={BASE} className="adm-link">
          Back to your trips
        </Link>
      </Empty>
    </section>
  );
}

const NOT_FOUND = adminErrorMessage({ kind: "rejected", code: "not_found" });
const notFound = (message?: string) => message === NOT_FOUND;

export function TripDetail({ id }: { id: string }) {
  const { state, reload } = useMine(`trip:${id}`, (s) => myTrip(id, s), null);
  const t = state.data ?? undefined;
  const block = useTripBlock(t);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const toast = useToast();
  const open = t && (t.status === "planned" || t.status === "ongoing");

  async function cancelTrip() {
    setBusy(true);
    setError(null);
    try {
      await updateTrip(id, { status: "cancelled" });
      setConfirming(false);
      toast.show("Trip cancelled.");
      reload();
    } catch (e) {
      setConfirming(false);
      setError(adminErrorMessage(toError(e)));
    } finally {
      setBusy(false);
    }
  }

  const actions = t && (
    <div className="adm-actions">
      {block ? (
        <span data-tip={block}>
          <button type="button" className="adm-btn adm-btn--secondary" {...unavailable(block)}>
            Edit
          </button>
        </span>
      ) : (
        <Link href={`${BASE}/${id}/edit`} className="adm-btn adm-btn--secondary">
          Edit
        </Link>
      )}
      {open && (
        <span data-tip={block ?? undefined}>
          <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirming(true)} {...unavailable(block)}>
            Cancel trip
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="adm-page">
      <PageHead title="Trip" lead="Only you can see this trip." actions={actions} />
      {state.kind === "error" && !t ? (
        notFound(state.message) ? <NotFound /> : <ErrorState message={state.message} onRetry={reload} />
      ) : !t ? (
        state.kind === "ready" ? (
          <NotFound />
        ) : (
          <section className="adm-card">
            <SkeletonBlock lines={4} />
          </section>
        )
      ) : (
        <>
          {error && (
            <p className="adm-field-error" role="alert">
              {error}
            </p>
          )}
          <section className="adm-summary" aria-labelledby="trip-title">
            <div className="adm-summary__top">
              <SummaryIcon>
                <MapIcon size={20} />
              </SummaryIcon>
              <div className="adm-summary__id">
                <h2 id="trip-title" className="adm-summary__name">
                  {t.title}
                </h2>
                <span className="adm-inline">
                  <Pill status={t.status} />
                  {t.sample && <SampleChip />}
                </span>
              </div>
            </div>
            <dl className="adm-summary__facts" data-cols={2}>
              <div className="adm-summary__fact adm-summary__fact--wide">
                <dt>Dates</dt>
                <dd className="adm-num">{tripDates(t)}</dd>
              </div>
              <div className="adm-summary__fact">
                <dt>Destination</dt>
                <dd>{t.destination}</dd>
              </div>
              <div className="adm-summary__fact">
                <dt>Added</dt>
                <dd className="adm-num">{fmtDate(t.createdAt)}</dd>
              </div>
            </dl>
          </section>
          <section className="adm-card adm-card__body" aria-labelledby="trip-notes">
            <h2 id="trip-notes" className="adm-label">
              Notes
            </h2>
            <p className="adm-note">{PRIVATE}</p>
            {t.notes ? <p className="adm-pre">{t.notes}</p> : <p className="adm-muted">No notes.</p>}
          </section>
        </>
      )}
      {confirming && t && (
        <ConfirmDialog
          title="Cancel this trip?"
          body={`“${t.title}” will be marked as cancelled. It stays in your list under Cancelled.`}
          confirm="Cancel trip"
          cancel="Keep trip"
          busy={busy}
          onConfirm={() => void cancelTrip()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

const EMPTY: TripValues = { title: "", destination: "", startDate: "", endDate: "", notes: "" };

/** Create (no id) or edit a trip. */
export function TripFormPage({ id }: { id?: string }) {
  const editing = id !== undefined;
  const { state, reload } = useMine(`trip:${id ?? "new"}`, (s) => (id ? myTrip(id, s) : Promise.resolve(null)), null);
  const trip = state.data ?? undefined;
  const block = useTripBlock(trip);
  const [values, setValues] = useState<TripValues>(EMPTY);
  const [status, setStatus] = useState<TripStatus>("planned");
  const [errors, setErrors] = useState<Errors<keyof TripValues>>({});
  const [tried, setTried] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const toError = useApiError();
  const toast = useToast();

  // Fill the form once the trip being edited has arrived.
  useEffect(() => {
    if (!trip) return;
    setValues({ title: trip.title, destination: trip.destination, startDate: trip.startDate, endDate: trip.endDate, notes: trip.notes ?? "" });
    setStatus(trip.status);
  }, [trip]);

  // After a submit with errors, move focus to the first field that has one.
  useEffect(() => {
    if (tried > 0) focusFirstInvalid(form.current);
  }, [tried]);

  const set = (k: keyof TripValues) => (e: { target: { value: string } }) => {
    const next = { ...values, [k]: e.target.value };
    setValues(next);
    // Once the form has been sent, errors follow the edits.
    if (tried > 0) setErrors(checkTrip(next));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (block || saving) return;
    const found = checkTrip(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setTried((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      const body = { ...values, title: values.title.trim(), destination: values.destination.trim() };
      const saved = editing ? await updateTrip(id, { ...body, status }) : await createTrip(body);
      toast.show(editing ? "Changes saved." : "Trip created.");
      navigate(`${BASE}/${saved.id}`);
    } catch (err) {
      const apiError = toError(err);
      const code = err instanceof ApiFailure && apiError.kind === "rejected" ? apiError.code : null;
      const field = code ? (FIELD_OF_CODE[code] as keyof TripValues | undefined) : undefined;
      if (code && field) {
        setErrors({ [field]: CODE_TEXT[code] });
        setTried((n) => n + 1);
      } else setFormError(code && CODE_TEXT[code] ? CODE_TEXT[code]! : adminErrorMessage(apiError));
    } finally {
      setSaving(false);
    }
  }

  const title = editing ? "Edit trip" : "New trip";
  if (editing && state.kind === "error" && !trip) {
    return (
      <div className="adm-page">
        <PageHead title={title} />
        {notFound(state.message) ? <NotFound /> : <ErrorState message={state.message} onRetry={reload} />}
      </div>
    );
  }
  if (editing && !trip) {
    return (
      <div className="adm-page">
        <PageHead title={title} lead="Change where, when or the status." />
        <section className="adm-card">{state.kind === "ready" ? <NotFound /> : <SkeletonBlock lines={6} />}</section>
      </div>
    );
  }

  const min = yearsFromToday(-2);
  const max = yearsFromToday(3);
  const notesLeft = TRIP_LIMITS.notes - [...values.notes].length;
  return (
    <div className="adm-page">
      <PageHead title={title} lead={editing ? "Change where, when or the status." : "Where and when. You can change it later."} />
      <section className="adm-card">
        <form ref={form} className="adm-form" noValidate onSubmit={(e) => void onSubmit(e)}>
          <Field label="Title" error={errors.title}>
            <input className="adm-input" value={values.title} onChange={set("title")} maxLength={TRIP_LIMITS.title + 20} autoComplete="off" required />
          </Field>
          <Field label="Destination" hint="A city, or a city and country: Kyoto, Japan." error={errors.destination}>
            <input className="adm-input" value={values.destination} onChange={set("destination")} maxLength={TRIP_LIMITS.destination + 20} autoComplete="off" required />
          </Field>
          <div className="adm-form__row">
            <Field label="Start date" error={errors.startDate}>
              <input className="adm-input" type="date" value={values.startDate} onChange={set("startDate")} min={min} max={max} required />
            </Field>
            <Field label="End date" error={errors.endDate}>
              <input className="adm-input" type="date" value={values.endDate} onChange={set("endDate")} min={values.startDate || min} max={max} required />
            </Field>
          </div>
          {editing && (
            <Field label="Status" hint="To cancel the trip, use Cancel trip on its page.">
              <select className="adm-input" value={status} onChange={(e) => setStatus(e.target.value as TripStatus)}>
                {(["planned", "ongoing", "completed", ...(status === "cancelled" ? ["cancelled"] : [])] as TripStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_TEXT[s]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notes (optional)" hint={`${PRIVATE} ${notesLeft >= 0 ? `${notesLeft} characters left.` : ""}`} error={errors.notes}>
            <textarea rows={4} value={values.notes} onChange={set("notes")} maxLength={TRIP_LIMITS.notes + 50} />
          </Field>
          {formError && (
            <p className="adm-field-error" role="alert">
              {formError}
            </p>
          )}
          {block && <p className="adm-field__hint">{block}.</p>}
          <div className="adm-form__actions">
            <Link href={editing ? `${BASE}/${id}` : BASE} className="adm-btn adm-btn--secondary">
              Discard
            </Link>
            <span data-tip={block ?? undefined}>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={saving} {...unavailable(block)}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create trip"}
              </button>
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}
