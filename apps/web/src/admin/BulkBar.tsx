import { useId, useState } from "react";
import { BULK_MAX, STATUS_TEXT, type BulkResult, type Decision } from "../api/admin";
import { READ_ONLY_LABEL } from "./context";

const NOTE_MAX = 300;

/**
 * The floating bar for selected rows: Approve, or Reject with a shared note
 * and a confirm step. At most 25 rows per request. There is no bulk delete.
 */
export function BulkBar({
  count,
  readOnly,
  busy,
  noteRequiredFor = "reject",
  onDecide,
  onClear,
}: {
  count: number;
  readOnly: boolean;
  busy: boolean;
  noteRequiredFor?: Decision;
  onDecide: (decision: Decision, note?: string) => void;
  onClear: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const noteId = useId();
  const errId = useId();
  if (count === 0) return null;
  const tooMany = count > BULK_MAX;
  const disabled = readOnly || busy || tooMany;
  const trimmed = note.trim();
  const noteError =
    trimmed.length === 0 ? "A note is required to reject." : trimmed.length > NOTE_MAX ? `Use at most ${NOTE_MAX} characters.` : null;

  return (
    <div className="adm-bulk" role="region" aria-label="Bulk actions">
      <p className="adm-bulk__count" aria-live="polite">
        <strong>{count}</strong> selected
        {tooMany && <span className="adm-bulk__warn"> · at most {BULK_MAX} per action</span>}
      </p>
      {!rejecting ? (
        <div className="adm-bulk__actions">
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={disabled}
            onClick={() => onDecide("approve")}
          >
            Approve {count}
          </button>
          <button type="button" className="adm-btn adm-btn--danger" disabled={disabled} onClick={() => setRejecting(true)}>
            Reject…
          </button>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClear}>
            Clear
          </button>
          {readOnly && <span className="adm-bulk__ro">{READ_ONLY_LABEL}</span>}
        </div>
      ) : (
        <form
          className="adm-bulk__reject"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (noteError || disabled) return;
            onDecide("reject", trimmed);
            setRejecting(false);
            setNote("");
            setTouched(false);
          }}
        >
          <label htmlFor={noteId} className="adm-bulk__label">
            Note for all {count} {noteRequiredFor === "reject" ? "(required)" : ""}
          </label>
          <textarea
            id={noteId}
            value={note}
            rows={2}
            maxLength={NOTE_MAX + 20}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={touched && !!noteError}
            aria-describedby={touched && noteError ? errId : undefined}
            data-autofocus
          />
          {touched && noteError && (
            <p id={errId} className="adm-field-error" role="alert">
              {noteError}
            </p>
          )}
          <div className="adm-bulk__actions">
            <button type="submit" className="adm-btn adm-btn--danger" disabled={disabled}>
              Confirm: reject {count}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={() => {
                setRejecting(false);
                setTouched(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const ERROR_TEXT: Record<string, string> = {
  not_found: "Not found (removed, or in the other scope)",
  already_decided: "Already decided the other way",
};

/** What happened to each row of a bulk action, failures included. */
export function BulkResults({
  result,
  names,
  onDismiss,
}: {
  result: BulkResult;
  names: Record<string, string>;
  onDismiss: () => void;
}) {
  return (
    <section className="adm-results" aria-label="Bulk action results">
      <header className="adm-results__head">
        <p role="status">
          {result.decision === "approve" ? "Approve" : "Reject"}: {result.succeeded} done
          {result.failed > 0 && `, ${result.failed} failed`}.
        </p>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </header>
      <ul className="adm-results__list">
        {result.results.map((r) => (
          <li key={r.id} data-ok={r.ok}>
            <span className="adm-results__name">{names[r.id] ?? r.id.slice(-8)}</span>
            <span className="adm-results__outcome">
              {r.ok
                ? r.changed
                  ? STATUS_TEXT[r.status ?? ""] ?? r.status
                  : `Unchanged (already ${STATUS_TEXT[r.status ?? ""]?.toLowerCase() ?? r.status})`
                : `Failed: ${ERROR_TEXT[r.error ?? ""] ?? r.error}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
