import { useEffect, useId, useState } from "react";
import {
  APP_STATUSES,
  LANGUAGE_NAME,
  STATUS_TEXT,
  application,
  applications,
  bulkDecide,
  clearAdminCache,
  decideApplication,
  reviewApplication,
  type AppStatus,
  type Application,
  type BulkResult,
  type Decision,
} from "../../api/admin";
import { navigate, useSearchParams } from "../../router";
import { BulkBar, BulkResults } from "../BulkBar";
import { READ_ONLY_LABEL, useAdmin } from "../context";
import { KanbanIcon, ListIcon } from "../icons";
import { MoveMenu, type MoveTarget } from "../MoveMenu";
import { openDetail, withParam } from "../params";
import {
  Chip,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  Pager,
  Pill,
  SampleChip,
  Segmented,
  SkeletonBlock,
  SkeletonRows,
  Timeline,
  adminErrorMessage,
  fmtDate,
  useAdminData,
  useApiError,
  type Step,
} from "../ui";

const NOTE_MAX = 300;
const LIST_SIZE = 20;
const COLUMN_SIZE = 50;

type View = "kanban" | "list";

export function Guides() {
  const { readOnly } = useAdmin();
  const params = useSearchParams();
  const openId = params.get("id");
  const view: View = params.get("view") === "list" ? "list" : "kanban";
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const toError = useApiError();

  /** A card moved through its menu. Rejecting needs a note, so it opens the drawer's form. */
  async function move(app: Application, to: MoveTarget) {
    setError(null);
    setNotice(null);
    if (to === "rejected") {
      navigate(withParam("id", app.id) + "&action=reject");
      return;
    }
    try {
      if (to === "in_review") await reviewApplication(app.id);
      else await decideApplication(app.id, "approve");
      setNotice(`${app.applicant}: moved to ${STATUS_TEXT[to]}.`);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(adminErrorMessage(toError(e)));
      clearAdminCache();
      setVersion((v) => v + 1);
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Guide applications</h1>
          <p className="adm-page__lead">Verified travellers who want to guide. Approving a real application makes the person a guide.</p>
        </div>
        <Segmented<View>
          label="View"
          value={view}
          onChange={(v) => navigate(withParam("view", v === "list" ? "list" : null), { replace: true })}
          options={[
            { value: "kanban", label: (<><KanbanIcon size={14} /> Board</>) },
            { value: "list", label: (<><ListIcon size={14} /> List</>) },
          ]}
        />
      </header>
      <div aria-live="polite" className="adm-live">
        {notice && <p className="adm-notice">{notice}</p>}
      </div>
      {error && (
        <p className="adm-inline-error" role="alert">
          {error}
        </p>
      )}
      {view === "kanban" ? (
        <Board version={version} readOnly={readOnly} onMove={move} />
      ) : (
        <ListView version={version} readOnly={readOnly} onMove={move} />
      )}
      {openId && (
        <ApplicationDrawer
          id={openId}
          startRejecting={params.get("action") === "reject"}
          onClose={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("id");
            url.searchParams.delete("action");
            navigate(url.pathname + url.search);
          }}
          onChanged={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

// ---- board

function Board({ version, readOnly, onMove }: { version: number; readOnly: boolean; onMove: (a: Application, to: MoveTarget) => void }) {
  const [column, setColumn] = useState<AppStatus>("submitted");
  const { state, reload } = useAdminData(`guide-board:${version}`, async (s) => {
    const lists = await Promise.all(APP_STATUSES.map((status) => applications({ status, size: COLUMN_SIZE }, s)));
    return Object.fromEntries(APP_STATUSES.map((st, i) => [st, lists[i]!])) as Record<AppStatus, Awaited<ReturnType<typeof applications>>>;
  });
  if (state.kind === "error" && !state.data) return <ErrorState message={state.message} onRetry={reload} />;
  const data = state.data;
  return (
    <>
      {/* Phones show one column at a time. */}
      <div className="adm-board__switch">
        <Segmented<AppStatus>
          label="Column"
          value={column}
          onChange={setColumn}
          options={APP_STATUSES.map((s) => ({
            value: s,
            label: (
              <>
                {STATUS_TEXT[s]}
                <span className="adm-count">{data ? data[s].counts[s] : "–"}</span>
              </>
            ),
          }))}
        />
      </div>
      {!data && <Loading what="guide applications" />}
      <div className="adm-board" data-column={column}>
        {APP_STATUSES.map((s) => {
          const list = data?.[s];
          return (
            <section key={s} className="adm-board__col" data-col={s} aria-labelledby={`col-${s}`}>
              <header className={`adm-board__head adm-board__head--${s}`}>
                <h2 id={`col-${s}`}>{STATUS_TEXT[s]}</h2>
                <span className="adm-count">{list ? list.counts[s] : "–"}</span>
              </header>
              {!list ? (
                <SkeletonBlock lines={5} />
              ) : list.items.length === 0 ? (
                <Empty>No applications.</Empty>
              ) : (
                <ul className="adm-board__cards">
                  {list.items.map((a) => (
                    <li key={a.id}>
                      <AppCard app={a} readOnly={readOnly} onMove={onMove} />
                    </li>
                  ))}
                </ul>
              )}
              {list && list.hasMore && <p className="adm-muted adm-small">Showing the newest {COLUMN_SIZE}. Use the list view for the rest.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function AppCard({ app, readOnly, onMove }: { app: Application; readOnly: boolean; onMove: (a: Application, to: MoveTarget) => void }) {
  return (
    <article className="adm-appcard" aria-labelledby={`app-${app.id}`}>
      <div className="adm-appcard__top">
        <Pill status={app.status} />
        {app.sample && <SampleChip />}
      </div>
      <h3 id={`app-${app.id}`} className="adm-appcard__title">
        <button type="button" className="adm-rowlink" onClick={() => openDetail(app.id)}>
          {app.headline}
        </button>
      </h3>
      <p className="adm-appcard__who">{app.applicant}</p>
      <ul className="adm-chips" aria-label="Cities">
        {app.cities.map((c) => (
          <li key={c}>
            <Chip tone="info">{c}</Chip>
          </li>
        ))}
      </ul>
      <div className="adm-appcard__foot">
        <span className="adm-muted adm-small">{fmtDate(app.createdAt)}</span>
        <MoveMenu status={app.status} label={app.headline} readOnly={readOnly} onMove={(to) => onMove(app, to)} />
      </div>
    </article>
  );
}

// ---- list

function ListView({ version, readOnly, onMove }: { version: number; readOnly: boolean; onMove: (a: Application, to: MoveTarget) => void }) {
  const [filter, setFilter] = useState<AppStatus | "all">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const { state, reload } = useAdminData(`guide-list:${filter}:${page}:${version}`, (s) =>
    applications({ status: filter === "all" ? undefined : filter, page, size: LIST_SIZE }, s),
  );
  useEffect(() => setSelected(new Set()), [filter, page, version]);
  useEffect(() => setPage(0), [filter]);
  const rows = state.data?.items ?? [];
  const open = (a: Application) => a.status === "submitted" || a.status === "in_review";
  const openRows = rows.filter(open);
  const names = Object.fromEntries(rows.map((r) => [r.id, r.applicant]));
  const allOpenSelected = openRows.length > 0 && openRows.every((r) => selected.has(r.id));

  async function onBulk(decision: Decision, note?: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await bulkDecide("guide-applications", [...selected], decision, note));
      setSelected(new Set());
      reload();
    } catch (e) {
      setError(adminErrorMessage(toError(e)));
    } finally {
      setBusy(false);
    }
  }

  const counts = state.data?.counts;
  return (
    <div className="adm-card adm-card--flush">
      <div className="adm-toolbar">
        <Segmented<AppStatus | "all">
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${counts ? counts.total : ""}` },
            ...APP_STATUSES.map((s) => ({ value: s, label: `${STATUS_TEXT[s]} ${counts ? counts[s] : ""}` })),
          ]}
        />
      </div>
      {error && (
        <p className="adm-inline-error" role="alert">
          {error}
        </p>
      )}
      {result && <BulkResults result={result} names={names} onDismiss={() => setResult(null)} />}
      {state.kind === "error" && !state.data ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <div className="adm-table-wrap">
          {state.kind === "loading" && <Loading what="guide applications" />}
          <table className="adm-table" aria-busy={state.kind === "loading"}>
            <caption className="visually-hidden">Guide applications, newest first</caption>
            <thead>
              <tr>
                <th scope="col" className="adm-table__check">
                  {!readOnly && openRows.length > 0 ? (
                    <input
                      type="checkbox"
                      aria-label="Select every open application on this page"
                      checked={allOpenSelected}
                      onChange={() => setSelected(allOpenSelected ? new Set() : new Set(openRows.map((r) => r.id)))}
                    />
                  ) : (
                    <span className="visually-hidden">Selection</span>
                  )}
                </th>
                <th scope="col">Application</th>
                <th scope="col">Applicant</th>
                <th scope="col">Cities</th>
                <th scope="col">Submitted</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!state.data && <SkeletonRows cols={7} />}
              {state.data &&
                rows.map((a) => (
                  <tr key={a.id} aria-selected={selected.has(a.id)} className={selected.has(a.id) ? "is-selected" : undefined}>
                    <td className="adm-table__check" data-label="Select">
                      {!readOnly && open(a) && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${a.applicant}`}
                          checked={selected.has(a.id)}
                          onChange={() =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (n.has(a.id)) n.delete(a.id);
                              else n.add(a.id);
                              return n;
                            })
                          }
                        />
                      )}
                    </td>
                    <th scope="row" data-label="Application">
                      <button type="button" className="adm-rowlink" onClick={() => openDetail(a.id)}>
                        {a.headline}
                      </button>
                      {a.sample && <SampleChip />}
                    </th>
                    <td data-label="Applicant">{a.applicant}</td>
                    <td data-label="Cities">{a.cities.join(", ")}</td>
                    <td data-label="Submitted">{fmtDate(a.createdAt)}</td>
                    <td data-label="Status">
                      <Pill status={a.status} />
                    </td>
                    <td data-label="Actions">
                      <MoveMenu status={a.status} label={a.headline} readOnly={readOnly} onMove={(to) => onMove(a, to)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {state.data && rows.length === 0 && <Empty>No applications here.</Empty>}
        </div>
      )}
      {state.data && (
        <Pager page={page} hasMore={state.data.hasMore} size={LIST_SIZE} shown={rows.length} total={state.data.total} onPage={setPage} />
      )}
      <BulkBar count={selected.size} readOnly={readOnly} busy={busy} onDecide={onBulk} onClear={() => setSelected(new Set())} />
    </div>
  );
}

// ---- detail drawer

/** Timeline steps from the application's dates and its audit history. */
export function applicationSteps(a: Application): Step[] {
  const events = a.history ?? [];
  const reviewed = events.find((e) => e.action === "guide_application.review");
  const roleChange = events.find((e) => e.action === "user.role_to_guide");
  const decided = a.status === "approved" || a.status === "rejected";
  const steps: Step[] = [
    { label: "Submitted", state: a.status === "submitted" ? "current" : "done", at: a.createdAt, detail: a.applicant },
  ];
  if (reviewed || a.status === "in_review") {
    steps.push({
      label: "In review",
      state: a.status === "in_review" ? "current" : "done",
      at: reviewed?.at ?? a.reviewedAt,
      detail: reviewed?.admin || a.reviewer ? `By ${reviewed?.admin ?? a.reviewer}` : undefined,
    });
  } else if (decided) {
    steps.push({ label: "In review", state: "skipped", detail: "Skipped: decided directly from Submitted." });
  } else {
    steps.push({ label: "In review", state: "todo" });
  }
  if (decided) {
    steps.push({
      label: a.status === "approved" ? "Approved" : "Rejected",
      state: roleChange ? "done" : "current",
      tone: a.status === "approved" ? "good" : "bad",
      at: a.decidedAt,
      detail: (
        <>
          {a.reviewer && <>By {a.reviewer}. </>}
          {a.decisionNote && <>Note: “{a.decisionNote}”</>}
        </>
      ),
    });
    if (roleChange) steps.push({ label: "Role changed to guide", state: "current", tone: "good", at: roleChange.at });
  } else {
    steps.push({ label: "Decision", state: "todo" });
  }
  return steps;
}

function ApplicationDrawer({
  id,
  startRejecting,
  onClose,
  onChanged,
}: {
  id: string;
  startRejecting: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { readOnly } = useAdmin();
  const { state, reload } = useAdminData(`application:${id}`, (s) => application(id, s));
  const [mode, setMode] = useState<"idle" | "approve" | "reject">(startRejecting ? "reject" : "idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const noteId = useId();
  const roId = useId();
  const a = state.data;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      clearAdminCache();
      reload();
      onChanged();
      setMode("idle");
      setNote("");
    } catch (e) {
      setError(adminErrorMessage(toError(e)));
      clearAdminCache();
      reload();
    } finally {
      setBusy(false);
    }
  }

  function submit(decision: Decision) {
    const n = note.trim();
    if (decision === "reject" && (n.length === 0 || n.length > NOTE_MAX)) {
      setError(`Add a note (1 to ${NOTE_MAX} characters) to reject.`);
      return;
    }
    if (n.length > NOTE_MAX) {
      setError(`Use at most ${NOTE_MAX} characters.`);
      return;
    }
    void run(() => decideApplication(id, decision, n || undefined));
  }

  const isOpen = a && (a.status === "submitted" || a.status === "in_review");
  return (
    <Drawer title={a ? a.headline : "Guide application"} onClose={onClose}>
      {state.kind === "error" && !a && <ErrorState message={state.message} onRetry={reload} />}
      {!a && state.kind === "loading" && <SkeletonBlock lines={8} />}
      {a && (
        <>
          <div className="adm-drawer__chips">
            <Pill status={a.status} />
            {a.sample && <SampleChip />}
            <Chip tone={a.applicantVerified ? "good" : "warn"}>{a.applicantVerified ? "Verified" : "Not verified"}</Chip>
          </div>
          <dl className="adm-facts">
            <dt>Applicant</dt>
            <dd>
              {a.applicant} <span className="adm-muted">({a.applicantRole})</span>
            </dd>
            <dt>Languages</dt>
            <dd>{a.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(", ")}</dd>
            <dt>Cities</dt>
            <dd>{a.cities.join(", ")}</dd>
            <dt>Bio</dt>
            <dd className="adm-pre">{a.bio}</dd>
          </dl>
          <h3 className="adm-drawer__h3">Timeline</h3>
          <Timeline label="Application timeline" steps={applicationSteps(a)} />
          {isOpen ? (
            <form
              className="adm-decision"
              onSubmit={(e) => {
                e.preventDefault();
                submit(mode === "reject" ? "reject" : "approve");
              }}
            >
              <h3 className="adm-drawer__h3">Decision</h3>
              {readOnly && (
                <p id={roId} className="adm-ro-note">
                  {READ_ONLY_LABEL}
                </p>
              )}
              {!a.sample && a.applicantRole === "traveller" && !readOnly && (
                <p className="adm-muted adm-small">Approving makes {a.applicant} a guide. The role change is written to the audit log.</p>
              )}
              {mode !== "idle" && (
                <div className="adm-field">
                  <label htmlFor={noteId}>
                    Note {mode === "reject" ? "(required" : "(optional"}, up to {NOTE_MAX} characters)
                  </label>
                  <textarea id={noteId} rows={3} value={note} maxLength={NOTE_MAX + 20} onChange={(e) => setNote(e.target.value)} disabled={readOnly} data-autofocus />
                </div>
              )}
              {error && (
                <p className="adm-field-error" role="alert">
                  {error}
                </p>
              )}
              <div className="adm-decision__actions">
                {mode === "idle" ? (
                  <>
                    {a.status === "submitted" && (
                      <button type="button" className="adm-btn adm-btn--secondary" disabled={readOnly || busy} aria-describedby={readOnly ? roId : undefined} onClick={() => void run(() => reviewApplication(id))}>
                        Move to review
                      </button>
                    )}
                    <button type="button" className="adm-btn adm-btn--primary" disabled={readOnly || busy} aria-describedby={readOnly ? roId : undefined} onClick={() => setMode("approve")}>
                      Approve…
                    </button>
                    <button type="button" className="adm-btn adm-btn--danger" disabled={readOnly || busy} aria-describedby={readOnly ? roId : undefined} onClick={() => setMode("reject")}>
                      Reject…
                    </button>
                  </>
                ) : (
                  <>
                    <button type="submit" className={`adm-btn ${mode === "reject" ? "adm-btn--danger" : "adm-btn--primary"}`} disabled={readOnly || busy}>
                      {mode === "reject" ? "Confirm reject" : "Confirm approve"}
                    </button>
                    <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setMode("idle")}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
          ) : (
            <p className="adm-final" role="status">
              {a.status === "approved" ? "Approved. " : "Rejected. "}Decisions are final and recorded in the audit log.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
