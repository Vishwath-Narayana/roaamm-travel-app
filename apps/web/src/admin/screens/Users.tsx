import { useEffect, useState } from "react";
import { users, type UserSort } from "../../api/admin";
import { useSearchParams } from "../../router";
import { SortHeader } from "../SortHeader";
import {
  Chip,
  Empty,
  ErrorState,
  Loading,
  Pager,
  SampleChip,
  SearchBox,
  Segmented,
  SkeletonRows,
  fmtDate,
  useAdminData,
  useDebounced,
} from "../ui";

const SIZE = 20;
type RoleFilter = "" | "traveller" | "guide" | "admin";
type VerifiedFilter = "" | "true" | "false";
const ROLE_LABEL = { traveller: "Traveller", guide: "Guide", admin: "Admin" } as const;

export function Users() {
  // The command palette opens this screen with ?q=<name>.
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);
  const q = useDebounced(search.trim());
  const [role, setRole] = useState<RoleFilter>("");
  const [verified, setVerified] = useState<VerifiedFilter>("");
  const [sort, setSort] = useState<UserSort>("created_desc");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, role, verified, sort]);

  const { state, reload } = useAdminData(`users:${q}:${role}:${verified}:${sort}:${page}`, (s) =>
    users({ q, role, verified, sort, page, size: SIZE }, s),
  );
  const rows = state.data?.items ?? [];
  const sortBy = (col: "name" | "created") => {
    const [c, d] = sort.split("_") as ["name" | "created", "asc" | "desc"];
    setSort(`${col}_${c === col && d === "asc" ? "desc" : c === col ? "asc" : col === "name" ? "asc" : "desc"}` as UserSort);
  };
  const [sortCol, sortDir] = sort.split("_") as ["name" | "created", "asc" | "desc"];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Users</h1>
          <p className="adm-page__lead">Display name, role and verification only. No email or contact detail exists.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar adm-toolbar--wrap">
          <SearchBox value={search} onChange={setSearch} label="Search users by name" placeholder="Search by name" />
          <Segmented<RoleFilter>
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: "", label: "All roles" },
              { value: "traveller", label: "Travellers" },
              { value: "guide", label: "Guides" },
              { value: "admin", label: "Admins" },
            ]}
          />
          <Segmented<VerifiedFilter>
            label="Verification"
            value={verified}
            onChange={setVerified}
            options={[
              { value: "", label: "Any" },
              { value: "true", label: "Verified" },
              { value: "false", label: "Not verified" },
            ]}
          />
        </div>
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <div className="adm-table-wrap">
            {state.kind === "loading" && <Loading what="users" />}
            <table className="adm-table" aria-busy={state.kind === "loading"}>
              <caption className="visually-hidden">Users in your scope</caption>
              <thead>
                <tr>
                  <SortHeader label="Name" active={sortCol === "name"} dir={sortDir} onSort={() => sortBy("name")} />
                  <th scope="col">Short id</th>
                  <th scope="col">Role</th>
                  <th scope="col">Verified</th>
                  <th scope="col">Account</th>
                  <SortHeader label="Joined" active={sortCol === "created"} dir={sortDir} onSort={() => sortBy("created")} />
                </tr>
              </thead>
              <tbody>
                {!state.data && <SkeletonRows cols={6} />}
                {state.data &&
                  rows.map((u) => (
                    <tr key={u.id}>
                      <th scope="row" data-label="Name">
                        <span className="adm-avatar" aria-hidden="true">
                          {u.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        {u.displayName}
                      </th>
                      <td data-label="Short id" className="mono adm-muted">
                        {u.shortId}
                      </td>
                      <td data-label="Role">
                        <Chip tone={u.role === "admin" ? "warn" : u.role === "guide" ? "info" : "neutral"}>{ROLE_LABEL[u.role]}</Chip>
                      </td>
                      <td data-label="Verified">
                        <Chip tone={u.verified ? "good" : "neutral"}>{u.verified ? "Verified" : "Not verified"}</Chip>
                      </td>
                      <td data-label="Account">
                        {u.sample ? <SampleChip /> : <Chip tone={u.demo ? "sample" : "neutral"}>{u.demo ? "Demo" : "Real"}</Chip>}
                      </td>
                      <td data-label="Joined">{fmtDate(u.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {state.data && rows.length === 0 && <Empty>{q ? `No users match “${q}”.` : "No users with these filters."}</Empty>}
          </div>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={rows.length} total={state.data.total} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
