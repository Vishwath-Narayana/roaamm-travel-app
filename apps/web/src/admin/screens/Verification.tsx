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
import { DOC_LABEL, type AdminRequest, type DocType } from "../../api/verification";
import { useSearchParams } from "../../router";
import { BulkBar, BulkResults } from "../BulkBar";
import { READ_ONLY_LABEL, useAdmin } from "../context";
import { openDetail } from "../params";
import { Tabs } from "../Tabs";
import { shortId } from "./Audit";
import {
  Chip,
  Count,
  DataTable,
  Drawer,
  ErrorState,
  Loading,
  PageHead,
  Pager,
  Pill,
  Scroller,
  SearchBox,
  SectionLabel,
  SkeletonBlock,
  Timeline,
  adminErrorMessage,
  fmtDate,
  initials,
  unavailable,
  useAdminData,
  useApiError,
  useDebounced,
  type Column,
  type Step,
} from "../ui";

const LABEL: Record<VerificationStatus, string> = { pending: "Pending", verified: "Verified", rejected: "Rejected" };
const REASON_MAX = 200;
const PAGE_SIZE = 20; // fixed by the API for this queue

const roleText = (r: AdminRequest) => (r.userRole === "guide" ? "Guide" : "Traveller");
const docText = (r: AdminRequest) => DOC_LABEL[r.docType as DocType] ?? r.docType;

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

  const rows = state.data?.items;
  const names = Object.fromEntries((rows ?? []).map((r) => [r.id, r.userDisplayName]));

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
  // One column template for all three tabs (the checkbox column is reserved
  // on Verified and Rejected too), so switching tabs moves no header.
  const columns: Column<AdminRequest>[] = [
    {
      key: "person",
      header: "Person",
      primary: true,
      size: 30,
      cell: (r) => (
        <>
          <span className="adm-cell__text">{r.userDisplayName}</span>
          <Chip>{roleText(r)}</Chip>
        </>
      ),
    },
    { key: "doc", header: "Document", size: 16, cell: docText },
    { key: "ref", header: "Sample ref", size: 16, wide: true, cell: (r) => <span className="mono adm-ref">{r.sampleRef}</span> },
    { key: "submitted", header: "Submitted", size: 14, cell: (r) => <span className="adm-num">{fmtDate(r.createdAt)}</span> },
    { key: "status", header: "Status", size: 12, cell: (r) => <Pill status={r.status} /> },
    { key: "decided", header: "Decided", size: 12, wide: true, cell: (r) => <span className="adm-num">{r.decidedAt ? fmtDate(r.decidedAt) : "—"}</span> },
  ];

  return (
    <div className="adm-page">
      <PageHead
        title="Verification"
        lead="Simulated ID checks: a document type and a sample reference. No real ID is ever collected."
      />
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          <Scroller>
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
                    <Count n={counts?.[s]} />
                  </>
                ),
              }))}
            />
          </Scroller>
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
            <>
              {state.kind === "loading" && <Loading what="verification requests" />}
              <DataTable
                caption={`${LABEL[tab]} verification requests, newest first (simulated sample IDs)`}
                columns={columns}
                rows={rows}
                busy={state.kind === "loading"}
                onOpen={(r) => openDetail(r.id)}
                checkColumn
                selection={
                  tab === "pending"
                    ? {
                        selected,
                        onChange: setSelected,
                        blocked: () => (readOnly ? READ_ONLY_LABEL : null),
                        allLabel: "Select every row on this page",
                        rowLabel: (r) => `Select ${r.userDisplayName}`,
                      }
                    : undefined
                }
                phone={(r) => ({
                  title: r.userDisplayName,
                  pill: <Pill status={r.status} />,
                  meta: [roleText(r), <span className="adm-num" key="d">{fmtDate(r.createdAt)}</span>],
                })}
                empty={q ? `No ${tab} requests match “${q}”.` : `No ${tab} requests.`}
              />
            </>
          )}
          {state.data && (
            <Pager
              page={page}
              hasMore={state.data.hasMore}
              size={PAGE_SIZE}
              shown={state.data.items.length}
              total={q ? null : counts?.[tab]}
              noun={["request", "requests"]}
              onPage={setPage}
            />
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
  const formId = useId();

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
        { label: "Request submitted", state: "done", at: r.createdAt, detail: `${docText(r)} · ${r.sampleRef}` },
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
  const ro = unavailable(readOnly ? READ_ONLY_LABEL : null);
  const pending = r?.status === "pending";

  const footer = r ? (
    pending ? (
      <div className="adm-actions">
        {!rejecting ? (
          <>
            <button type="button" className="adm-btn adm-btn--danger" disabled={busy} onClick={() => setRejecting(true)} {...ro}>
              Reject…
            </button>
            <button type="submit" form={formId} className="adm-btn adm-btn--primary" disabled={busy} {...ro}>
              Approve
            </button>
          </>
        ) : (
          <>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button type="submit" form={formId} className="adm-btn adm-btn--danger" disabled={busy} {...ro}>
              Confirm reject
            </button>
          </>
        )}
      </div>
    ) : (
      <p className="adm-final" role="status">
        This request is decided. Decisions are final and recorded in the audit log.
      </p>
    )
  ) : undefined;

  return (
    <Drawer
      title={r ? r.userDisplayName : "Verification request"}
      label="Verification request"
      summary={
        r && {
          lead: (
            <span className="adm-avatar adm-avatar--lg" aria-hidden="true">
              {initials(r.userDisplayName)}
            </span>
          ),
          pill: <Pill status={r.status} />,
          facts: [
            ["Role", roleText(r)],
            ["Submitted", <span className="adm-num">{fmtDate(r.createdAt)}</span>],
            ["Decided", <span className="adm-num">{r.decidedAt ? fmtDate(r.decidedAt) : "—"}</span>],
          ],
        }
      }
      onClose={onClose}
      footer={footer}
      footNote={readOnly && pending ? READ_ONLY_LABEL : undefined}
    >
      {state.kind === "error" && !r && <ErrorState message={state.message} onRetry={reload} />}
      {!r && state.kind === "loading" && <SkeletonBlock lines={6} />}
      {r && (
        <>
          <section className="adm-section">
            <SectionLabel>Details</SectionLabel>
            <dl className="adm-facts">
              <dt>Document</dt>
              <dd>{docText(r)} (simulated)</dd>
              <dt>Sample ref</dt>
              <dd className="mono adm-ref">{r.sampleRef}</dd>
              <dt>Request id</dt>
              <dd className="mono adm-ref">{shortId(r.id)}</dd>
            </dl>
          </section>
          <section className="adm-section">
            <SectionLabel>Timeline</SectionLabel>
            <Timeline label="Verification timeline" steps={steps} />
            {audit.length > 0 && (
              <p className="adm-note">
                Audit log: {audit.length} entr{audit.length === 1 ? "y" : "ies"} for this request.
              </p>
            )}
          </section>
          {pending && (
            <form
              id={formId}
              className="adm-section"
              onSubmit={(e) => {
                e.preventDefault();
                if (readOnly) return;
                void decide(rejecting ? "reject" : "approve");
              }}
            >
              <SectionLabel>Decision</SectionLabel>
              {rejecting ? (
                <div className="adm-field">
                  <label htmlFor={reasonId}>Reason (required, up to {REASON_MAX} characters)</label>
                  <textarea id={reasonId} value={reason} rows={3} maxLength={REASON_MAX + 20} onChange={(e) => setReason(e.target.value)} data-autofocus />
                </div>
              ) : (
                <p className="adm-note">Approve verifies the person. Rejecting needs a reason, which they will see.</p>
              )}
              {error && (
                <p className="adm-field-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </>
      )}
    </Drawer>
  );
}
