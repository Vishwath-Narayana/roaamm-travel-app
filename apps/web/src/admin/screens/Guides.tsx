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
import { FINAL_LABEL, READ_ONLY_LABEL, useAdmin } from "../context";
import { CompassIcon, KanbanIcon, ListIcon } from "../icons";
import { MoveMenu, type MoveTarget } from "../MoveMenu";
import { openDetail, withParam } from "../params";
import { shortId } from "./Audit";
import {
  Chip,
  Count,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  PageHead,
  Pager,
  Pill,
  Scroller,
  SectionLabel,
  Segmented,
  SkeletonBlock,
  SummaryIcon,
  Timeline,
  VerifiedMark,
  adminErrorMessage,
  cleanTitle,
  fmtDate,
  unavailable,
  useAdminData,
  useApiError,
  useMedia,
  type Column,
  type Step,
} from "../ui";

const NOTE_MAX = 300;
const LIST_SIZE = 20;
const COLUMN_SIZE = 50;
/** Below 1024 px the board shows one column at a time, picked by equal-width tabs. */
const ONE_COLUMN = "(max-width: 1023px)";

type View = "kanban" | "list";

const isOpen = (a: Application) => a.status === "submitted" || a.status === "in_review";

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
      <PageHead
        title="Guide applications"
        lead="Verified travellers who want to guide. Approving a real application makes the person a guide."
        actions={
          <Segmented<View>
            label="View"
            value={view}
            onChange={(v) => navigate(withParam("view", v === "list" ? "list" : null), { replace: true })}
            options={[
              { value: "kanban", label: (<><KanbanIcon size={16} /> Board</>) },
              { value: "list", label: (<><ListIcon size={16} /> List</>) },
            ]}
          />
        }
      />
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
  const oneColumn = useMedia(ONE_COLUMN);
  const { state, reload } = useAdminData(`guide-board:${version}`, async (s) => {
    const lists = await Promise.all(APP_STATUSES.map((status) => applications({ status, size: COLUMN_SIZE }, s)));
    return Object.fromEntries(APP_STATUSES.map((st, i) => [st, lists[i]!])) as Record<AppStatus, Awaited<ReturnType<typeof applications>>>;
  });
  if (state.kind === "error" && !state.data) {
    return (
      <section className="adm-card">
        <ErrorState message={state.message} onRetry={reload} />
      </section>
    );
  }
  const data = state.data;
  const shown = oneColumn ? [column] : APP_STATUSES;
  return (
    <>
      {oneColumn && (
        <Segmented<AppStatus>
          label="Column"
          value={column}
          onChange={setColumn}
          fill
          options={APP_STATUSES.map((s) => ({
            value: s,
            label: (
              <>
                <span className="adm-seg__text">{STATUS_TEXT[s]}</span>
                <Count n={data?.[s].counts[s]} />
              </>
            ),
          }))}
        />
      )}
      {!data && <Loading what="guide applications" />}
      <div className="adm-board" data-columns={shown.length}>
        {shown.map((s) => {
          const list = data?.[s];
          return (
            <section key={s} className="adm-board__col" data-col={s} aria-labelledby={`col-${s}`}>
              <header className={`adm-board__head adm-board__head--${s}`} data-hidden={oneColumn || undefined}>
                <span className="adm-board__dot" aria-hidden="true" />
                <h2 id={`col-${s}`}>{STATUS_TEXT[s]}</h2>
                <Count n={list?.counts[s]} />
              </header>
              {!list ? (
                <SkeletonBlock lines={5} />
              ) : list.items.length === 0 ? (
                <div className="adm-board__empty">
                  <Empty>No applications.</Empty>
                </div>
              ) : (
                <ul className="adm-board__cards">
                  {list.items.map((a) => (
                    <li key={a.id}>
                      <AppCard app={a} readOnly={readOnly} onMove={onMove} />
                    </li>
                  ))}
                </ul>
              )}
              {list && list.hasMore && <p className="adm-note">Showing the newest {COLUMN_SIZE}. Use the list view for the rest.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

/**
 * A kanban card: title, applicant, date and cities. The column already says
 * the status. The whole card opens the drawer; the ⋯ menu sits above that.
 */
export function AppCard({ app, readOnly, onMove }: { app: Application; readOnly: boolean; onMove: (a: Application, to: MoveTarget) => void }) {
  const title = cleanTitle(app.headline);
  return (
    <article className="adm-appcard" aria-labelledby={`app-${app.id}`}>
      <div className="adm-appcard__head">
        <h3 id={`app-${app.id}`} className="adm-appcard__title">
          <button type="button" className="adm-rowlink adm-stretch" onClick={() => openDetail(app.id)}>
            {title}
          </button>
        </h3>
        <MoveMenu status={app.status} label={title} readOnly={readOnly} onMove={(to) => onMove(app, to)} />
      </div>
      <p className="adm-appcard__meta">
        <span className="adm-appcard__who">{app.applicant}</span>
        <span className="adm-row__sep" aria-hidden="true">
          ·
        </span>
        <time className="adm-appcard__date" dateTime={app.createdAt}>
          {fmtDate(app.createdAt)}
        </time>
      </p>
      <ul className="adm-chips" aria-label="Cities">
        {app.cities.map((c) => (
          <li key={c}>
            <Chip tone="info">{c}</Chip>
          </li>
        ))}
      </ul>
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
  const rows = state.data?.items;
  const names = Object.fromEntries((rows ?? []).map((r) => [r.id, r.applicant]));

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
  const columns: Column<Application>[] = [
    { key: "title", header: "Application", primary: true, size: 32, cell: (a) => <span className="adm-cell__text">{cleanTitle(a.headline)}</span> },
    { key: "applicant", header: "Applicant", size: 18, wide: true, cell: (a) => a.applicant },
    { key: "cities", header: "Cities", size: 16, wide: true, cell: (a) => a.cities.join(", ") },
    { key: "submitted", header: "Submitted", size: 14, cell: (a) => <span className="adm-num">{fmtDate(a.createdAt)}</span> },
    { key: "status", header: "Status", size: 13, cell: (a) => <Pill status={a.status} /> },
    {
      key: "actions",
      header: <span className="visually-hidden">Actions</span>,
      size: "action",
      cell: (a) => <MoveMenu status={a.status} label={cleanTitle(a.headline)} readOnly={readOnly} onMove={(to) => onMove(a, to)} />,
    },
  ];

  return (
    <div className="adm-card adm-card--flush">
      <div className="adm-toolbar">
        <Scroller>
          <Segmented<AppStatus | "all">
            label="Status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: (<>All<Count n={counts?.total} /></>) },
              ...APP_STATUSES.map((s) => ({ value: s, label: (<>{STATUS_TEXT[s]}<Count n={counts?.[s]} /></>) })),
            ]}
          />
        </Scroller>
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
        <>
          {state.kind === "loading" && <Loading what="guide applications" />}
          <DataTable
            caption="Guide applications, newest first"
            columns={columns}
            rows={rows}
            busy={state.kind === "loading"}
            onOpen={(a) => openDetail(a.id)}
            selection={{
              selected,
              onChange: setSelected,
              blocked: (a) => (readOnly ? READ_ONLY_LABEL : isOpen(a) ? null : FINAL_LABEL),
              allLabel: "Select every open application on this page",
              rowLabel: (a) => `Select ${a.applicant}`,
            }}
            phone={(a) => ({
              title: cleanTitle(a.headline),
              pill: <Pill status={a.status} />,
              meta: [a.applicant, <span className="adm-num" key="d">{fmtDate(a.createdAt)}</span>],
            })}
            empty="No applications here."
          />
        </>
      )}
      {state.data && (
        <Pager
          page={page}
          hasMore={state.data.hasMore}
          size={LIST_SIZE}
          shown={state.data.items.length}
          total={state.data.total}
          noun={["application", "applications"]}
          onPage={setPage}
        />
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
  const [mode, setMode] = useState<"idle" | "approve" | "reject">(startRejecting && !readOnly ? "reject" : "idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toError = useApiError();
  const noteId = useId();
  const formId = useId();
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

  const open = a && isOpen(a);
  const ro = unavailable(readOnly ? READ_ONLY_LABEL : null);
  const footer = a ? (
    open ? (
      <div className="adm-actions">
        {mode === "idle" ? (
          <>
            <button type="button" className="adm-btn adm-btn--primary" disabled={busy} onClick={() => setMode("approve")} {...ro}>
              Approve…
            </button>
            <button type="button" className="adm-btn adm-btn--danger" disabled={busy} onClick={() => setMode("reject")} {...ro}>
              Reject…
            </button>
            {a.status === "submitted" && (
              <button type="button" className="adm-btn adm-btn--secondary" disabled={busy} onClick={() => void run(() => reviewApplication(id))} {...ro}>
                Move to review
              </button>
            )}
          </>
        ) : (
          <>
            <button type="submit" form={formId} className={`adm-btn ${mode === "reject" ? "adm-btn--danger" : "adm-btn--primary"}`} disabled={busy} {...ro}>
              {mode === "reject" ? "Confirm reject" : "Confirm approve"}
            </button>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </>
        )}
      </div>
    ) : (
      <p className="adm-final" role="status">
        {a.status === "approved" ? "Approved. " : "Rejected. "}Decisions are final and recorded in the audit log.
      </p>
    )
  ) : undefined;

  return (
    <Drawer
      title={a ? cleanTitle(a.headline) : "Guide application"}
      label="Guide application"
      summary={
        a && {
          lead: (
            <SummaryIcon>
              <CompassIcon size={20} />
            </SummaryIcon>
          ),
          pill: <Pill status={a.status} />,
          facts: [
            ["Applicant", a.applicant],
            ["Submitted", <span className="adm-num">{fmtDate(a.createdAt)}</span>],
            ["Decided", <span className="adm-num">{a.decidedAt ? fmtDate(a.decidedAt) : "—"}</span>],
          ],
        }
      }
      onClose={onClose}
      footer={footer}
    >
      {state.kind === "error" && !a && <ErrorState message={state.message} onRetry={reload} />}
      {!a && state.kind === "loading" && <SkeletonBlock lines={8} />}
      {a && (
        <>
          <section className="adm-section">
            <SectionLabel>Details</SectionLabel>
            <dl className="adm-facts">
              <dt>Applicant</dt>
              <dd className="adm-inline">
                <span>
                  {a.applicant} <span className="adm-muted">({a.applicantRole})</span>
                </span>
                <VerifiedMark verified={a.applicantVerified} text />
              </dd>
              <dt>Languages</dt>
              <dd>{a.languages.map((l) => LANGUAGE_NAME[l] ?? l).join(", ")}</dd>
              <dt>Cities</dt>
              <dd>{a.cities.join(", ")}</dd>
              <dt>Bio</dt>
              <dd className="adm-pre">{a.bio}</dd>
              <dt>Application id</dt>
              <dd className="mono adm-ref">{shortId(a.id)}</dd>
            </dl>
          </section>
          <section className="adm-section">
            <SectionLabel>Timeline</SectionLabel>
            <Timeline label="Application timeline" steps={applicationSteps(a)} />
          </section>
          {open && (
            <form
              id={formId}
              className="adm-section"
              onSubmit={(e) => {
                e.preventDefault();
                if (readOnly) return;
                submit(mode === "reject" ? "reject" : "approve");
              }}
            >
              <SectionLabel>Decision</SectionLabel>
              {!a.sample && a.applicantRole === "traveller" && !readOnly && (
                <p className="adm-note">Approving makes {a.applicant} a guide. The role change is written to the audit log.</p>
              )}
              {mode !== "idle" ? (
                <div className="adm-field">
                  <label htmlFor={noteId}>
                    Note {mode === "reject" ? "(required" : "(optional"}, up to {NOTE_MAX} characters)
                  </label>
                  <textarea id={noteId} rows={3} value={note} maxLength={NOTE_MAX + 20} onChange={(e) => setNote(e.target.value)} data-autofocus />
                </div>
              ) : (
                (a.sample || a.applicantRole !== "traveller" || readOnly) && (
                  <p className="adm-note">Approve or reject from the bar below. A rejection needs a note.</p>
                )
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
