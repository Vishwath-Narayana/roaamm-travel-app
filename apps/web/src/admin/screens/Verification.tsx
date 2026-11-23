import { useEffect, useId, useState } from "react";
import {
  VERIFICATION_STATUSES,
  bulkDecide,
  clearAdminCache,
  decideVerification,
  verificationDetail,
  verificationQueue,
  type BulkResult,
  type Decision,
  type VerificationStatus,
} from "../../api/admin";
import { DOC_LABEL, type DocType } from "../../api/verification";
import { useSearchParams } from "../../router";
import { BulkBar, BulkResults } from "../BulkBar";
import { READ_ONLY_LABEL, useAdmin } from "../context";
import { openDetail } from "../params";
import { Tabs } from "../Tabs";
import {
  Chip,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  Pager,
  Pill,
  SearchBox,
  SkeletonBlock,
  SkeletonRows,
  Timeline,
  adminErrorMessage,
  fmtDate,
  useAdminData,
  useApiError,
  useDebounced,
  type Step,
} from "../ui";

const LABEL: Record<VerificationStatus, string> = { pending: "Pending", verified: "Verified", rejected: "Rejected" };
const REASON_MAX = 200;
const PAGE_SIZE = 20; // fixed by the API for this queue

export function Verification() {
  const { readOnly } = useAdmin();
  const params = useSearchParams();
  const openId = params.get("id");
  const [tab, setTab] = useState<VerificationStatus>("pending");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const toError = useApiError();

  const { state, reload } = useAdminData(`verification:${tab}:${q}:${page}`, (s) =>
    verificationQueue({ status: tab, q, page }, s),
  );
  // Selection is per page: a new tab, search or page starts empty.
  useEffect(() => setSelected(new Set()), [tab, q, page]);
  useEffect(() => setPage(0), [tab, q]);

  const rows = state.data?.items ?? [];
  const names = Object.fromEntries(rows.map((r) => [r.id, r.userDisplayName]));
  const selectable = tab === "pending" && !readOnly;
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function onBulk(decision: Decision, note?: string) {
    setBusy(true);
    setActionError(null);
    try {
      setResult(await bulkDecide("verification", [...selected], decision, note));
      setSelected(new Set());
      reload();
    } catch (e) {
      setActionError(adminErrorMessage(toError(e)));
    } finally {
      setBusy(false);
    }
  }

  const counts = state.data?.counts;
  const idBase = useId();

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Verification</h1>
          <p className="adm-page__lead">Simulated ID checks: a document type and a sample reference. No real ID is ever collected.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          <Tabs
            label="Verification status"
            idBase={idBase}
            value={tab}
            onChange={setTab}
            tabs={VERIFICATION_STATUSES.map((s) => ({
              value: s,
              label: (
                <>
                  {LABEL[s]}
                  <span className="adm-count">{counts ? counts[s] : "–"}</span>
                </>
              ),
            }))}
          />
          <SearchBox value={search} onChange={setSearch} label="Search by name" placeholder="Search by name" />
        </div>
        <div id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-tab-${tab}`}>
          {actionError && (
            <p className="adm-inline-error" role="alert">
              {actionError}
            </p>
          )}
          {result && <BulkResults result={result} names={names} onDismiss={() => setResult(null)} />}
          {state.kind === "error" && !state.data ? (
            <ErrorState message={state.message} onRetry={reload} />
          ) : (
            <div className="adm-table-wrap">
              {state.kind === "loading" && <Loading what="verification requests" />}
              <table className="adm-table" aria-busy={state.kind === "loading"}>
                <caption className="visually-hidden">
                  {LABEL[tab]} verification requests, newest first (simulated sample IDs)
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="adm-table__check">
                      {selectable ? (
                        <input
                          type="checkbox"
                          aria-label="Select every row on this page"
                          checked={allOnPage}
                          onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
                        />
                      ) : (
                        <span className="visually-hidden">Selection</span>
                      )}
                    </th>
                    <th scope="col">Person</th>
                    <th scope="col">Document</th>
                    <th scope="col">Sample ref</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Status</th>
                    <th scope="col">Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {!state.data && <SkeletonRows cols={7} />}
                  {state.data &&
                    rows.map((r) => (
                      <tr key={r.id} aria-selected={selected.has(r.id)} className={selected.has(r.id) ? "is-selected" : undefined}>
                        <td className="adm-table__check" data-label="Select">
                          {selectable && (
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.userDisplayName}`}
                              checked={selected.has(r.id)}
                              onChange={() => toggle(r.id)}
                            />
                          )}
                        </td>
                        <th scope="row" data-label="Person">
                          <button type="button" className="adm-rowlink" onClick={() => openDetail(r.id)}>
                            {r.userDisplayName}
                          </button>
                          <Chip>{r.userRole === "guide" ? "Guide" : "Traveller"}</Chip>
                        </th>
                        <td data-label="Document">{DOC_LABEL[r.docType as DocType] ?? r.docType}</td>
                        <td data-label="Sample ref" className="mono adm-muted">
                          {r.sampleRef}
                        </td>
                        <td data-label="Submitted">{fmtDate(r.createdAt)}</td>
                        <td data-label="Status">
                          <Pill status={r.status} />
                        </td>
                        <td data-label="Decided">{r.decidedAt ? fmtDate(r.decidedAt) : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {state.data && rows.length === 0 && (
                <Empty>{q ? `No ${tab} requests match “${q}”.` : `No ${tab} requests.`}</Empty>
              )}
            </div>
          )}
          {state.data && (
            <Pager page={page} hasMore={state.data.hasMore} size={PAGE_SIZE} shown={rows.length} total={q ? null : counts?.[tab]} onPage={setPage} />
          )}
        </div>
      </div>
      {tab === "pending" && (
        <BulkBar count={selected.size} readOnly={readOnly} busy={busy} onDecide={onBulk} onClear={() => setSelected(new Set())} />
      )}
      {openId && <VerificationDrawer id={openId} onClose={() => openDetail(null)} onChanged={reload} />}
    </div>
  );
}

function VerificationDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { readOnly } = useAdmin();
  const { state, reload } = useAdminData(`verification-detail:${id}`, (s) => verificationDetail(id, s));
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const reasonId = useId();
  const roId = useId();

  async function decide(decision: Decision) {
    if (decision === "reject" && (reason.trim().length === 0 || reason.trim().length > REASON_MAX)) {
      setError(`Give a reason (1 to ${REASON_MAX} characters) to reject.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideVerification(id, decision, decision === "reject" ? reason.trim() : undefined);
      clearAdminCache();
      reload();
      onChanged();
      setRejecting(false);
    } catch (e) {
      setError(adminErrorMessage(toError(e)));
      reload();
    } finally {
      setBusy(false);
    }
  }

  const r = state.data;
  const steps: Step[] = r
    ? [
        { label: "Request submitted", state: "done", at: r.createdAt, detail: `${DOC_LABEL[r.docType as DocType] ?? r.docType} · ${r.sampleRef}` },
        r.status === "pending"
          ? { label: "Waiting for a decision", state: "current" }
          : {
              label: r.status === "verified" ? "Approved: verified" : "Rejected",
              state: "current",
              tone: r.status === "verified" ? "good" : "bad",
              at: r.decidedAt,
              detail: (
                <>
                  {r.decidedBy && <>By {r.decidedBy}. </>}
                  {r.reason && <>Reason: “{r.reason}”</>}
                </>
              ),
            },
      ]
    : [];
  const audit = r?.history ?? [];

  return (
    <Drawer title={r ? r.userDisplayName : "Verification request"} onClose={onClose}>
      {state.kind === "error" && !r && <ErrorState message={state.message} onRetry={reload} />}
      {!r && state.kind === "loading" && <SkeletonBlock lines={6} />}
      {r && (
        <>
          <dl className="adm-facts">
            <dt>Status</dt>
            <dd>
              <Pill status={r.status} />
            </dd>
            <dt>Role</dt>
            <dd>{r.userRole === "guide" ? "Guide" : "Traveller"}</dd>
            <dt>Document</dt>
            <dd>{DOC_LABEL[r.docType as DocType] ?? r.docType} (simulated)</dd>
            <dt>Sample ref</dt>
            <dd className="mono">{r.sampleRef}</dd>
          </dl>
          <h3 className="adm-drawer__h3">Timeline</h3>
          <Timeline label="Verification timeline" steps={steps} />
          {audit.length > 0 && (
            <p className="adm-muted adm-small">
              Audit log: {audit.length} entr{audit.length === 1 ? "y" : "ies"} for this request.
            </p>
          )}
          {r.status === "pending" ? (
            <form
              className="adm-decision"
              onSubmit={(e) => {
                e.preventDefault();
                void decide(rejecting ? "reject" : "approve");
              }}
            >
              <h3 className="adm-drawer__h3">Decision</h3>
              {readOnly && (
                <p id={roId} className="adm-ro-note">
                  {READ_ONLY_LABEL}
                </p>
              )}
              {rejecting && (
                <div className="adm-field">
                  <label htmlFor={reasonId}>Reason (required, up to {REASON_MAX} characters)</label>
                  <textarea id={reasonId} value={reason} rows={3} maxLength={REASON_MAX + 20} onChange={(e) => setReason(e.target.value)} disabled={readOnly} data-autofocus />
                </div>
              )}
              {error && (
                <p className="adm-field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="adm-decision__actions">
                {!rejecting ? (
                  <>
                    <button type="submit" className="adm-btn adm-btn--primary" disabled={readOnly || busy} aria-describedby={readOnly ? roId : undefined}>
                      Approve
                    </button>
                    <button type="button" className="adm-btn adm-btn--danger" disabled={readOnly || busy} aria-describedby={readOnly ? roId : undefined} onClick={() => setRejecting(true)}>
                      Reject…
                    </button>
                  </>
                ) : (
                  <>
                    <button type="submit" className="adm-btn adm-btn--danger" disabled={readOnly || busy}>
                      Confirm reject
                    </button>
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setRejecting(false)}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          ) : (
            <p className="adm-final" role="status">
              This request is decided. Decisions are final and recorded in the audit log.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
