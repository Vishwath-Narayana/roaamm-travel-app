// The member's simulated ID check (ADR 0006) in the app shell's style: the
// status, and "Use a sample ID" to start one. No real document is ever sent.
import { useId, useState } from "react";
import { cachedGet, clearAdminCache } from "../api/admin";
import { DOC_LABEL, DOC_TYPES, submitVerification, type DocType, type MyVerification } from "../api/verification";
import { Chip, ErrorState, Pill, SkeletonBlock, adminErrorMessage, fmtDate, unavailable, useApiError } from "../admin/ui";
import { useMine, useWriteBlock } from "./parts";

export const myVerification = (signal: AbortSignal) => cachedGet<MyVerification>("/v1/verification/me", signal);

export function VerificationCard() {
  const { state, reload } = useMine("verification", myVerification, { status: "none" } as MyVerification);
  const block = useWriteBlock();
  const [doc, setDoc] = useState<DocType>("passport");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const id = useId();
  const v = state.data;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await submitVerification(doc);
      clearAdminCache(); // the next read must not be the cached "not verified"
      reload();
    } catch (e) {
      setError(adminErrorMessage(toError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="adm-card adm-card__body" aria-labelledby={`${id}-t`}>
      <header className="adm-card__head">
        <h2 id={`${id}-t`}>ID verification</h2>
        {v && (v.status === "none" ? <Chip>Not verified</Chip> : <Pill status={v.status} />)}
      </header>
      {!v && state.kind === "error" && <ErrorState message={state.message} onRetry={reload} />}
      {!v && state.kind !== "error" && <SkeletonBlock lines={2} />}
      {v && (
        <p className="adm-note">
          {v.status === "verified" && `Verified on ${fmtDate(v.decidedAt)} with a sample ${v.docType ? DOC_LABEL[v.docType].toLowerCase() : "ID"}.`}
          {v.status === "pending" && `Your sample ID is waiting for an admin, sent ${fmtDate(v.createdAt)}.`}
          {v.status === "none" && "Verified travellers can apply to become guides. It takes a minute and no real document."}
          {v.status === "rejected" && `Rejected: ${v.reason ?? "no reason given"} You can try again.`}{" "}
          Simulated: no real ID is collected.
        </p>
      )}
      {v && (v.status === "none" || v.status === "rejected") && (
        <div className="adm-inline">
          <label htmlFor={`${id}-doc`} className="visually-hidden">
            Sample document type
          </label>
          <select id={`${id}-doc`} className="adm-input adm-input--auto" value={doc} onChange={(e) => setDoc(e.target.value as DocType)}>
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {DOC_LABEL[d]}
              </option>
            ))}
          </select>
          <span data-tip={block ?? undefined}>
            <button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={() => void start()} {...unavailable(block)}>
              {busy ? "Sending…" : "Use a sample ID"}
            </button>
          </span>
        </div>
      )}
      {error && (
        <p className="adm-field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
