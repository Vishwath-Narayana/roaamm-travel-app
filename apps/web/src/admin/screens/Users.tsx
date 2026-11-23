import { useEffect, useState } from "react";
import { users, type AdminUser, type UserSort } from "../../api/admin";
import { useSearchParams } from "../../router";
import { openDetail } from "../params";
import {
  Chip,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  Pager,
  SampleChip,
  Scroller,
  SearchBox,
  Segmented,
  fmtDate,
  initials,
  useAdminData,
  useDebounced,
  type ChipTone,
  type Column,
} from "../ui";

const SIZE = 20;
type RoleFilter = "" | "traveller" | "guide" | "admin";
type VerifiedFilter = "" | "true" | "false";
const ROLE_LABEL = { traveller: "Traveller", guide: "Guide", admin: "Admin" } as const;
const ROLE_TONE: Record<AdminUser["role"], ChipTone> = { traveller: "neutral", guide: "info", admin: "warn" };

const RoleChip = ({ u }: { u: AdminUser }) => <Chip tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Chip>;
const VerifiedChip = ({ u }: { u: AdminUser }) => <Chip tone={u.verified ? "good" : "neutral"}>{u.verified ? "Verified" : "Not verified"}</Chip>;
const AccountChip = ({ u }: { u: AdminUser }) =>
  u.sample ? <SampleChip /> : <Chip tone={u.demo ? "sample" : "neutral"}>{u.demo ? "Demo" : "Real"}</Chip>;

export function Users() {
  // The command palette and the audit log open this screen with ?q=<name>.
  const params = useSearchParams();
  const openId = params.get("id");
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
  const rows = state.data?.items;
  const sortBy = (col: "name" | "created") => {
    const [c, d] = sort.split("_") as ["name" | "created", "asc" | "desc"];
    setSort(`${col}_${c === col && d === "asc" ? "desc" : c === col ? "asc" : col === "name" ? "asc" : "desc"}` as UserSort);
  };
  const [sortCol, sortDir] = sort.split("_") as ["name" | "created", "asc" | "desc"];

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      sort: { active: sortCol === "name", dir: sortDir, onSort: () => sortBy("name") },
      cell: (u) => (
        <>
          <span className="adm-avatar" aria-hidden="true">
            {initials(u.displayName)}
          </span>
          <span className="adm-cell__text">{u.displayName}</span>
        </>
      ),
    },
    { key: "id", header: "Short id", wide: true, cell: (u) => <span className="mono adm-ref">{u.shortId}</span> },
    { key: "role", header: "Role", cell: (u) => <RoleChip u={u} /> },
    { key: "verified", header: "Verified", cell: (u) => <VerifiedChip u={u} /> },
    { key: "account", header: "Account", wide: true, cell: (u) => <AccountChip u={u} /> },
    {
      key: "joined",
      header: "Joined",
      sort: { active: sortCol === "created", dir: sortDir, onSort: () => sortBy("created") },
      cell: (u) => <span className="adm-num">{fmtDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Users</h1>
          <p className="adm-page__lead">Display name, role and verification only. No email or contact detail exists.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          <SearchBox value={search} onChange={setSearch} label="Search users by name" placeholder="Search by name" />
          <Scroller>
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
          </Scroller>
        </div>
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <>
            {state.kind === "loading" && <Loading what="users" />}
            <DataTable
              caption="Users in your scope"
              columns={columns}
              rows={rows}
              busy={state.kind === "loading"}
              onOpen={(u) => openDetail(u.id)}
              phone={(u) => ({
                title: u.displayName,
                pill: <RoleChip u={u} />,
                meta: [u.verified ? "Verified" : "Not verified", <span className="adm-num" key="j">Joined {fmtDate(u.createdAt)}</span>],
              })}
              empty={q ? `No users match “${q}”.` : "No users with these filters."}
            />
          </>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={state.data.items.length} total={state.data.total} noun={["user", "users"]} onPage={setPage} />
        )}
      </div>
      {openId && <UserDrawer user={rows?.find((u) => u.id === openId)} loading={!rows} onClose={() => openDetail(null)} />}
    </div>
  );
}

/** Built from the row already loaded: the API has no per-user read, and needs none. */
function UserDrawer({ user: u, loading, onClose }: { user?: AdminUser; loading: boolean; onClose: () => void }) {
  return (
    <Drawer title={u ? u.displayName : "User"} onClose={onClose}>
      {!u && !loading && <Empty>This user is not in the current list. Search by name to find them.</Empty>}
      {u && (
        <>
          <div className="adm-person">
            <span className="adm-avatar adm-avatar--lg" aria-hidden="true">
              {initials(u.displayName)}
            </span>
            <div className="adm-chips-row">
              <RoleChip u={u} />
              <VerifiedChip u={u} />
              <AccountChip u={u} />
            </div>
          </div>
          <dl className="adm-facts">
            <dt>Short id</dt>
            <dd className="mono adm-ref">{u.shortId}</dd>
            <dt>Joined</dt>
            <dd className="adm-num">{fmtDate(u.createdAt)}</dd>
            <dt>Contact</dt>
            <dd className="adm-muted">None stored. ROAAMM keeps no email or phone number.</dd>
          </dl>
        </>
      )}
    </Drawer>
  );
}
