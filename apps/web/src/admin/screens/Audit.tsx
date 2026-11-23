import { useState } from "react";
import { ACTION_TEXT, audit, type AuditRow } from "../../api/admin";
import { navigate } from "../../router";
import { Chip, DataTable, ErrorState, Loading, Pager, fmtDateTime, relTime, useAdminData, type Column } from "../ui";

const SIZE = 20; // fixed by the API

const TARGET_LABEL: Record<string, string> = {
  verification: "Verification",
  guide_application: "Guide application",
  user: "User",
};

/** Last 8 hex digits: the seeded ids all start with zeros, so the tail is what differs. */
export function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(-8);
}

/** The subject type: the API's targetType, else the action's prefix. */
const targetType = (a: AuditRow) => a.targetType ?? a.action.split(".")[0] ?? "";

/** Where an entry's subject opens: its drawer on its own screen. */
export function subjectHref(a: AuditRow): string | null {
  const id = encodeURIComponent(a.targetId);
  switch (targetType(a)) {
    case "verification":
      return `/app/admin/verification?id=${id}`;
    case "guide_application":
      return `/app/admin/guide-applications?id=${id}`;
    case "user":
      return `/app/admin/users?q=${encodeURIComponent(a.target ?? "")}&id=${id}`;
    default:
      return null;
  }
}

export function SubjectChip({ entry }: { entry: AuditRow }) {
  const t = targetType(entry);
  return t ? <Chip>{TARGET_LABEL[t] ?? t}</Chip> : null;
}

export function Audit() {
  const [page, setPage] = useState(0);
  const { state, reload } = useAdminData(`audit:${page}`, (s) => audit(page, s));
  const rows = state.data?.items;

  const columns: Column<AuditRow>[] = [
    { key: "action", header: "Action", primary: true, cell: (a) => <span className="adm-cell__text">{ACTION_TEXT[a.action] ?? a.action}</span> },
    { key: "admin", header: "Admin", wide: true, cell: (a) => a.admin ?? "Deleted account" },
    {
      key: "subject",
      header: "Subject",
      cell: (a) => (
        <span className="adm-subject">
          <SubjectChip entry={a} />
          <span className="adm-subject__name">{a.target ?? "Deleted"}</span>
          <span className="mono adm-subject__id">{shortId(a.targetId)}</span>
        </span>
      ),
    },
    {
      key: "when",
      header: "When",
      end: true,
      cell: (a) => (
        <time dateTime={a.createdAt} title={fmtDateTime(a.createdAt)} className="adm-num">
          {fmtDateTime(a.createdAt)}
        </time>
      ),
    },
  ];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Audit log</h1>
          <p className="adm-page__lead">Every admin decision, newest first. This log can't be edited or deleted.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <>
            {state.kind === "loading" && <Loading what="the audit log" />}
            <DataTable
              caption="Admin actions, newest first. This log can't be edited or deleted."
              columns={columns}
              rows={rows}
              busy={state.kind === "loading"}
              onOpen={(a) => {
                const href = subjectHref(a);
                if (href) navigate(href);
              }}
              phone={(a) => ({
                title: ACTION_TEXT[a.action] ?? a.action,
                pill: (
                  <time className="adm-row__time" dateTime={a.createdAt}>
                    {relTime(a.createdAt)}
                  </time>
                ),
                meta: [
                  a.admin ?? "Deleted account",
                  <span className="adm-subject" key="s">
                    <SubjectChip entry={a} />
                    <span className="adm-subject__name">{a.target ?? "Deleted"}</span>
                  </span>,
                ],
              })}
              empty="No admin actions yet."
            />
          </>
        )}
        {state.data && <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={state.data.items.length} noun={["entry", "entries"]} onPage={setPage} />}
      </div>
    </div>
  );
}
