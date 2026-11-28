// "Become a guide": the application form, or the status of the latest
// application with the admin drawer's timeline. After a rejection the reason
// is shown and the applicant can edit and resubmit (a new application: the
// API keeps one open application per user, ADR 0008).
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { LANGUAGE_NAME } from "../api/admin";
import { applyAsGuide, myApplication, GUIDE_LIMITS, type Mine, type MyApplication } from "../api/member";
import { ApiFailure } from "../api/session";
import { XIcon } from "../admin/icons";
import {
  ErrorState,
  PageHead,
  Pill,
  SectionLabel,
  SkeletonBlock,
  Timeline,
  adminErrorMessage,
  unavailable,
  useApiError,
  type Step,
} from "../admin/ui";
import { useToast } from "../components/Toast";
import { Link } from "../router";
import {
  CODE_TEXT,
  FIELD_OF_CODE,
  Field,
  checkApplication,
  focusFirstInvalid,
  useMine,
  useWriteBlock,
  type ApplicationValues,
  type Errors,
} from "./parts";

const NONE: Mine = { status: "none", canApply: false };
const LANGS = Object.keys(LANGUAGE_NAME).sort((a, b) => LANGUAGE_NAME[a]!.localeCompare(LANGUAGE_NAME[b]!));

/** The applicant's timeline: the same steps as the admin drawer, without admin names. */
export function memberSteps(a: MyApplication): Step[] {
  const decided = a.status === "approved" || a.status === "rejected";
  const steps: Step[] = [{ label: "Submitted", state: a.status === "submitted" ? "current" : "done", at: a.createdAt }];
  if (a.reviewedAt || a.status === "in_review") {
    steps.push({ label: "In review", state: a.status === "in_review" ? "current" : "done", at: a.reviewedAt });
  } else if (decided) {
    steps.push({ label: "In review", state: "skipped", detail: "Skipped: decided directly." });
  } else {
    steps.push({ label: "In review", state: "todo" });
  }
  if (decided) {
    const approved = a.status === "approved";
    steps.push({
      label: approved ? "Approved" : "Rejected",
      state: "current",
      tone: approved ? "good" : "bad",
      at: a.decidedAt,
      detail: a.decisionNote ? `${approved ? "Note" : "Reason"}: “${a.decisionNote}”` : undefined,
    });
  } else {
    steps.push({ label: "Decision", state: "todo" });
  }
  return steps;
}

export function BecomeGuide() {
  const { state, reload } = useMine("application", (s) => myApplication(s), NONE);
  const [editing, setEditing] = useState(false);
  const m = state.data;
  const a = m?.application;
  // No application yet: the form. After a rejection: the status, and the form once "Edit and resubmit" is chosen.
  const showForm = m && m.reason !== "already_guide" && (!a || editing);

  return (
    <div className="adm-page">
      <PageHead title="Become a guide" lead="Lead tours in a city you know. An admin reviews every application." />
      {!m && state.kind === "error" && (
        <section className="adm-card">
          <ErrorState message={state.message} onRetry={reload} />
        </section>
      )}
      {!m && state.kind !== "error" && (
        <section className="adm-card">
          <SkeletonBlock lines={6} />
        </section>
      )}
      {m?.reason === "already_guide" && (
        <section className="adm-card adm-card__body">
          <h2>You are a guide</h2>
          <p className="adm-note">Your application was approved. Your guide pages are in the guide app.</p>
          <p>
            <Link href="/app/guide" className="adm-btn adm-btn--primary">
              Open the guide app
            </Link>
          </p>
        </section>
      )}
      {m && a && !editing && m.reason !== "already_guide" && <Status app={a} canApply={m.canApply} onEdit={() => setEditing(true)} />}
      {m?.reason === "not_verified" && (
        <section className="adm-card adm-card__body" aria-labelledby="verify-first">
          <h2 id="verify-first">Verify your ID first</h2>
          <p className="adm-note">Only verified travellers can apply. It takes a minute with a sample ID; no real document is collected.</p>
          <p>
            <Link href="/app/traveller" className="adm-btn adm-btn--secondary">
              Verify on your overview
            </Link>
          </p>
        </section>
      )}
      {showForm && (
        <ApplicationForm
          initial={editing ? a : undefined}
          notVerified={m.reason === "not_verified"}
          onCancel={editing ? () => setEditing(false) : undefined}
          onSent={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Status({ app: a, canApply, onEdit }: { app: MyApplication; canApply: boolean; onEdit: () => void }) {
  const block = useWriteBlock();
  return (
    <>
      <section className="adm-card adm-card__body" aria-labelledby="app-status">
        <header className="adm-card__head">
          <h2 id="app-status">Your application</h2>
          <Pill status={a.status} />
        </header>
        {a.status === "rejected" && (
          <div className="adm-card__body">
            <p className="adm-note">
              <strong>Why it was not approved:</strong> {a.decisionNote ?? "No reason was given."}
            </p>
            {canApply && (
              <p>
                <span data-tip={block ?? undefined}>
                  <button type="button" className="adm-btn adm-btn--primary" onClick={onEdit} {...unavailable(block)}>
                    Edit and resubmit
                  </button>
                </span>
              </p>
            )}
          </div>
        )}
        {a.status === "approved" && <p className="adm-note">Approved. Sign out and in again to open your guide pages.</p>}
        <SectionLabel>Timeline</SectionLabel>
        <Timeline label="Application timeline" steps={memberSteps(a)} />
      </section>
      <section className="adm-card adm-card__body" aria-labelledby="app-sent">
        <h2 id="app-sent">What you sent</h2>
        <dl className="adm-facts">
          <dt>Headline</dt>
          <dd>{a.headline}</dd>
          <dt>Languages</dt>
          <dd>{a.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(", ")}</dd>
          <dt>Cities</dt>
          <dd>{a.cities.join(", ")}</dd>
          <dt>About</dt>
          <dd className="adm-pre">{a.bio}</dd>
        </dl>
      </section>
    </>
  );
}

function ApplicationForm({
  initial,
  notVerified,
  onCancel,
  onSent,
}: {
  initial?: MyApplication;
  notVerified: boolean;
  onCancel?: () => void;
  onSent: () => void;
}) {
  const writeBlock = useWriteBlock();
  const block = writeBlock ?? (notVerified ? "Verify your ID first" : null);
  const [v, setV] = useState<ApplicationValues>({
    headline: initial?.headline ?? "",
    bio: initial?.bio ?? "",
    languages: initial?.languages ?? [],
    cities: initial?.cities ?? [],
  });
  const [city, setCity] = useState("");
  const [errors, setErrors] = useState<Errors<keyof ApplicationValues>>({});
  const [tried, setTried] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const toError = useApiError();
  const toast = useToast();

  useEffect(() => {
    if (tried > 0) focusFirstInvalid(form.current);
  }, [tried]);

  const update = (next: ApplicationValues) => {
    setV(next);
    if (tried > 0) setErrors(checkApplication(next));
  };

  function addCity() {
    const c = city.trim().replace(/\s+/g, " ");
    if (!c || v.cities.some((x) => x.toLowerCase() === c.toLowerCase())) return setCity("");
    update({ ...v, cities: [...v.cities, c] });
    setCity("");
  }

  function onCityKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCity();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (block || saving) return;
    const found = checkApplication(v);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      setTried((n) => n + 1);
      return;
    }
    setSaving(true);
    try {
      await applyAsGuide({ ...v, headline: v.headline.trim(), bio: v.bio.trim() });
      toast.show(initial ? "Application resubmitted." : "Application sent.");
      onSent();
    } catch (err) {
      const apiError = toError(err);
      const code = err instanceof ApiFailure && apiError.kind === "rejected" ? apiError.code : null;
      const field = code ? (FIELD_OF_CODE[code] as keyof ApplicationValues | undefined) : undefined;
      if (code && field) {
        setErrors({ [field]: CODE_TEXT[code] });
        setTried((n) => n + 1);
      } else setFormError(code && CODE_TEXT[code] ? CODE_TEXT[code]! : adminErrorMessage(apiError));
    } finally {
      setSaving(false);
    }
  }

  const full = (n: number, max: number) => n >= max;
  return (
    <section className="adm-card adm-card__body" aria-labelledby="app-form">
      <h2 id="app-form">{initial ? "Edit and resubmit" : "Your application"}</h2>
      <form ref={form} className="adm-form" noValidate onSubmit={(e) => void onSubmit(e)}>
        <Field label="Headline" hint="One line travellers see first, e.g. Old-town walks and night markets." error={errors.headline}>
          <input className="adm-input" value={v.headline} onChange={(e) => update({ ...v, headline: e.target.value })} maxLength={GUIDE_LIMITS.headline + 20} autoComplete="off" />
        </Field>
        <Field label="About your tours" hint={`Up to ${GUIDE_LIMITS.bio} characters.`} error={errors.bio}>
          <textarea rows={5} value={v.bio} onChange={(e) => update({ ...v, bio: e.target.value })} maxLength={GUIDE_LIMITS.bio + 50} />
        </Field>
        <Field label="Languages" hint={`Up to ${GUIDE_LIMITS.languages}.`} error={errors.languages}>
          <select
            className="adm-input"
            value=""
            disabled={full(v.languages.length, GUIDE_LIMITS.languages)}
            onChange={(e) => e.target.value && update({ ...v, languages: [...v.languages, e.target.value] })}
          >
            <option value="">Add a language…</option>
            {LANGS.filter((l) => !v.languages.includes(l)).map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAME[l]}
              </option>
            ))}
          </select>
        </Field>
        <Picked label="Languages" items={v.languages} name={(l) => LANGUAGE_NAME[l] ?? l} onRemove={(l) => update({ ...v, languages: v.languages.filter((x) => x !== l) })} />
        <Field label="Cities" hint={`Up to ${GUIDE_LIMITS.cities}. Press Enter after each city.`} error={errors.cities}>
          <input
            className="adm-input"
            value={city}
            disabled={full(v.cities.length, GUIDE_LIMITS.cities)}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={onCityKey}
            onBlur={addCity}
            maxLength={GUIDE_LIMITS.city + 10}
            autoComplete="off"
          />
        </Field>
        <Picked label="Cities" items={v.cities} name={(c) => c} onRemove={(c) => update({ ...v, cities: v.cities.filter((x) => x !== c) })} />
        {formError && (
          <p className="adm-field-error" role="alert">
            {formError}
          </p>
        )}
        {block && <p className="adm-field__hint">{block}.</p>}
        <div className="adm-form__actions">
          {onCancel && (
            <button type="button" className="adm-btn adm-btn--secondary" onClick={onCancel}>
              Discard
            </button>
          )}
          <span data-tip={block ?? undefined}>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={saving} {...unavailable(block)}>
              {saving ? "Sending…" : initial ? "Resubmit application" : "Send application"}
            </button>
          </span>
        </div>
      </form>
    </section>
  );
}

/** The chosen languages or cities, each with a remove button. */
function Picked({ label, items, name, onRemove }: { label: string; items: string[]; name: (s: string) => string; onRemove: (s: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="adm-chips" aria-label={`Chosen ${label.toLowerCase()}`}>
      {items.map((i) => (
        <li key={i}>
          <button type="button" className="adm-chip adm-chip--btn" aria-label={`Remove ${name(i)}`} onClick={() => onRemove(i)}>
            {name(i)}
            <XIcon size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}
