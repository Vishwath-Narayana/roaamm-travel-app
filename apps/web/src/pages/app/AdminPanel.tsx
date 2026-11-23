import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import {
  DOC_LABEL,
  STATUS_LABEL,
  adminQueue,
  auditLog,
  decide,
  when,
  type AdminRequest,
  type AuditEntry,
  type Page,
} from "../../api/verification";
import { ApiFailure, errorMessage } from "../../api/session";
import "../../components/Input.css";
import "./AdminPanel.css";

type QueueStatus = "pending" | "verified" | "rejected";
const STATUSES: QueueStatus[] = ["pending", "verified", "rejected"];
const TABS = ["queue", "audit"] as const;
type Tab = (typeof TABS)[number];

const ACTION_LABEL: Record<string, string> = {
  "verification.approve": "Approved verification",
  "verification.reject": "Rejected verification",
};

type Props = { readOnly: boolean; onSignedOut: () => void };

/** The admin's verification queue and audit log. The demo admin sees demo data and cannot decide. */
export function AdminPanel({ readOnly, onSignedOut }: Props) {
  const [tab, setTab] = useState<Tab>("queue");
  const tabIds = { queue: useId(), audit: useId() };
  const panelIds = { queue: useId(), audit: useId() };
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ queue: null, audit: null });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End")
      return;
    e.preventDefault();
    const i = TABS.indexOf(tab);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : (i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  return (
    <section className="admin" aria-label="Administration">
      {readOnly && (
        <p className="admin__readonly" role="note">
          <strong>Read-only demo.</strong> You can look at everything here, but approving and
          rejecting are disabled. The queue shows simulated people and demo visitors only.
        </p>
      )}
      <div role="tablist" aria-label="Admin sections" className="admin__tabs">
        {TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            type="button"
            role="tab"
            id={tabIds[t]}
            aria-selected={tab === t}
            aria-controls={panelIds[t]}
            tabIndex={tab === t ? 0 : -1}
            className="admin__tab"
            onClick={() => setTab(t)}
            onKeyDown={onTabKey}
          >
            {t === "queue" ? "Verification queue" : "Audit log"}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelIds.queue}
        aria-labelledby={tabIds.queue}
        hidden={tab !== "queue"}
      >
        {tab === "queue" && <Queue readOnly={readOnly} onSignedOut={onSignedOut} />}
      </div>
      <div
        role="tabpanel"
        id={panelIds.audit}
        aria-labelledby={tabIds.audit}
        hidden={tab !== "audit"}
      >
        {tab === "audit" && <Audit onSignedOut={onSignedOut} />}
      </div>
    </section>
  );
}

function usePaged<T>(
  load: (page: number) => Promise<Page<T>>,
  onSignedOut: () => void,
  deps: unknown[],
) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page<T> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (p: number) => {
      setError(null);
      setData(null);
      try {
        setData(await load(p));
        setPage(p);
      } catch (e) {
        if (e instanceof ApiFailure && e.error.kind === "unauthenticated") onSignedOut();
        else setError(errorMessage(e instanceof ApiFailure ? e.error : { kind: "unavailable" }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    void fetchPage(0);
  }, [fetchPage]);

  return { page, data, error, fetchPage };
}

function Pager({ page, hasMore, go }: { page: number; hasMore: boolean; go: (p: number) => void }) {
  if (page === 0 && !hasMore) return null;
  return (
    <nav className="dash__actions admin__pager" aria-label="Pages">
      <Button variant="ghost" disabled={page === 0} onClick={() => go(page - 1)}>
        Previous
      </Button>
      <span aria-live="polite">Page {page + 1}</span>
      <Button variant="ghost" disabled={!hasMore} onClick={() => go(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

function Queue({ readOnly, onSignedOut }: Props) {
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [selected, setSelected] = useState<AdminRequest | null>(null);
  const { page, data, error, fetchPage } = usePaged((p) => adminQueue(status, p), onSignedOut, [
    status,
  ]);
  const captionId = useId();

  return (
    <div className="admin__queue">
      <div role="group" aria-label="Filter by status" className="admin__filters">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="admin__filter"
            aria-pressed={status === s}
            onClick={() => {
              setStatus(s);
              setSelected(null);
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="demo__error">
          {error}{" "}
          <Button variant="ghost" onClick={() => void fetchPage(page)}>
            Try again
          </Button>
        </div>
      )}
      {!data && !error && <p role="status">Loading the queue…</p>}
      {data && data.items.length === 0 && (
        <p role="status">
          {status === "pending"
            ? "The queue is empty. Nothing is waiting for a decision."
            : `No ${STATUS_LABEL[status].toLowerCase()} requests.`}
        </p>
      )}
      {data && data.items.length > 0 && (
        <div className="admin__table-wrap">
          <table className="admin__table" aria-describedby={captionId}>
            <caption id={captionId}>
              {STATUS_LABEL[status]} verification requests (simulated sample IDs), newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Role</th>
                <th scope="col">Document</th>
                <th scope="col">Sent</th>
                <th scope="col">
                  <span className="visually-hidden">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} aria-selected={selected?.id === r.id}>
                  <th scope="row">{r.userDisplayName}</th>
                  <td>{r.userRole === "guide" ? "Guide" : "Traveller"}</td>
                  <td>{DOC_LABEL[r.docType]}</td>
                  <td>{when(r.createdAt)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      aria-label={`Review ${r.userDisplayName}`}
                      onClick={() => setSelected(r)}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} hasMore={data.hasMore} go={(p) => void fetchPage(p)} />}

      {selected && (
        <Detail
          key={selected.id}
          request={selected}
          readOnly={readOnly}
          onSignedOut={onSignedOut}
          onClose={() => setSelected(null)}
          onDecided={() => void fetchPage(page)}
        />
      )}
    </div>
  );
}

function Detail({
  request,
  readOnly,
  onSignedOut,
  onClose,
  onDecided,
}: {
  request: AdminRequest;
  readOnly: boolean;
  onSignedOut: () => void;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [current, setCurrent] = useState(request);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const noteId = useId();

  // Move focus to the detail view so keyboard and screen reader users land on it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function act(decision: "approve" | "reject") {
    if (decision === "reject" && !reason.trim()) {
      setError("Give a reason (up to 200 characters) when rejecting.");
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const updated = await decide(
        current.id,
        decision,
        decision === "reject" ? reason.trim() : undefined,
      );
      setCurrent(updated);
      setDone(decision === "approve" ? "Approved." : "Rejected.");
      onDecided();
    } catch (e) {
      if (e instanceof ApiFailure && e.error.kind === "unauthenticated") onSignedOut();
      else setError(errorMessage(e instanceof ApiFailure ? e.error : { kind: "unavailable" }));
    } finally {
      setBusy(null);
    }
  }

  const pending = current.status === "pending";
  return (
    <Card as="section" className="admin__detail" aria-labelledby={titleId}>
      <h3 id={titleId} ref={headingRef} tabIndex={-1}>
        {current.userDisplayName}
      </h3>
      <dl className="admin__facts">
        <dt>Status</dt>
        <dd>{STATUS_LABEL[current.status]}</dd>
        <dt>Document type</dt>
        <dd>{DOC_LABEL[current.docType]}</dd>
        <dt>Sample reference</dt>
        <dd className="mono">{current.sampleRef}</dd>
        <dt>Sent</dt>
        <dd>{when(current.createdAt)}</dd>
        {current.decidedAt && (
          <>
            <dt>Decided</dt>
            <dd>
              {when(current.decidedAt)}
              {current.decidedBy && ` by ${current.decidedBy}`}
            </dd>
          </>
        )}
        {current.reason && (
          <>
            <dt>Reason</dt>
            <dd>{current.reason}</dd>
          </>
        )}
      </dl>
      <p className="auth__muted small">
        Simulated: no real ID is collected. There is no document to view.
      </p>

      {pending && (
        <div className="admin__decide">
          <label htmlFor={reasonId} className="field__label">
            Reason (needed to reject, up to 200 characters)
          </label>
          <textarea
            id={reasonId}
            className="field__input admin__reason"
            maxLength={200}
            rows={2}
            value={reason}
            disabled={readOnly}
            aria-describedby={readOnly ? noteId : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="dash__actions">
            <Button
              onClick={() => void act("approve")}
              disabled={readOnly || busy !== null}
              loading={busy === "approve"}
              aria-describedby={readOnly ? noteId : undefined}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => void act("reject")}
              disabled={readOnly || busy !== null}
              loading={busy === "reject"}
              aria-describedby={readOnly ? noteId : undefined}
            >
              Reject
            </Button>
          </div>
          {readOnly && (
            <p id={noteId} className="admin__readonly-note">
              Read-only demo: decisions are disabled.
            </p>
          )}
        </div>
      )}
      <div aria-live="assertive">
        {error && (
          <p role="alert" className="demo__error">
            {error}
          </p>
        )}
      </div>
      <p role="status" className="visually-hidden">
        {done}
      </p>
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    </Card>
  );
}

/** Last 8 hex digits: the seeded ids all start with zeros, so the tail is what differs. */
export function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(-8);
}

function Audit({ onSignedOut }: { onSignedOut: () => void }) {
  const { page, data, error, fetchPage } = usePaged(auditLog, onSignedOut, []);
  return (
    <div>
      {error && (
        <div role="alert" className="demo__error">
          {error}{" "}
          <Button variant="ghost" onClick={() => void fetchPage(page)}>
            Try again
          </Button>
        </div>
      )}
      {!data && !error && <p role="status">Loading the audit log…</p>}
      {data && data.items.length === 0 && <p role="status">No admin actions yet.</p>}
      {data && data.items.length > 0 && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <caption>Admin actions, newest first. This log can't be edited or deleted.</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Admin</th>
                <th scope="col">Action</th>
                <th scope="col">Request</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a: AuditEntry) => (
                <tr key={a.id}>
                  <td>{when(a.createdAt)}</td>
                  <td>{a.admin ?? "Deleted account"}</td>
                  <td>{ACTION_LABEL[a.action] ?? a.action}</td>
                  <td>
                    {a.target ?? "Deleted request"}{" "}
                    <span className="mono admin__short-id">{shortId(a.targetId)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} hasMore={data.hasMore} go={(p) => void fetchPage(p)} />}
    </div>
  );
}
