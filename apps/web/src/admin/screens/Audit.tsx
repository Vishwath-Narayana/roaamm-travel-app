import { useState } from "react";
import { ACTION_TEXT, audit } from "../../api/admin";
import { Chip, Empty, ErrorState, Loading, Pager, SkeletonRows, fmtDateTime, useAdminData } from "../ui";

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

export function Audit() {
  const [page, setPage] = useState(0);
  const { state, reload } = useAdminData(`audit:${page}`, (s) => audit(page, s));
  const rows = state.data?.items ?? [];
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
          <div className="adm-table-wrap">
            {state.kind === "loading" && <Loading what="the audit log" />}
            <table className="adm-table" aria-busy={state.kind === "loading"}>
              <caption className="visually-hidden">Admin actions, newest first. This log can't be edited or deleted.</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Admin</th>
                  <th scope="col">Action</th>
                  <th scope="col">Subject</th>
                </tr>
              </thead>
              <tbody>
                {!state.data && <SkeletonRows cols={4} />}
                {state.data &&
                  rows.map((a) => (
                    <tr key={a.id}>
                      <td data-label="When" className="adm-nowrap">
                        {fmtDateTime(a.createdAt)}
                      </td>
                      <td data-label="Admin">{a.admin ?? "Deleted account"}</td>
                      <th scope="row" data-label="Action">
                        {ACTION_TEXT[a.action] ?? a.action}
                      </th>
                      <td data-label="Subject">
                        {a.targetType && <Chip>{TARGET_LABEL[a.targetType] ?? a.targetType}</Chip>}{" "}
                        {a.target ?? "Deleted"} <span className="mono adm-muted adm-short-id">{shortId(a.targetId)}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {state.data && rows.length === 0 && <Empty>No admin actions yet.</Empty>}
          </div>
        )}
        {state.data && <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={rows.length} onPage={setPage} />}
      </div>
    </div>
  );
}
