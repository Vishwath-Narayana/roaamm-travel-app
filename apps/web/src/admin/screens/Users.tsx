import { useEffect, useState } from "react";
import { users, type AdminUser, type UserSort } from "../../api/admin";
import { useSearchParams } from "../../router";
import { useAdmin } from "../context";
import { openDetail } from "../params";
import {
  Chip,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  PageHead,
  Pager,
  Scroller,
  SearchBox,
  SectionLabel,
  Segmented,
  VerifiedMark,
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
/** Real admin only, in the drawer: one table for both scopes, so no Account column. */
const accountText = (u: AdminUser) => (u.demo ? "Demo" : "Real");

export function Users() {
  const { readOnly } = useAdmin();
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
      size: 32,
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
    { key: "id", header: "Short id", size: 16, wide: true, cell: (u) => <span className="mono adm-ref">{u.shortId}</span> },
    { key: "role", header: "Role", size: 16, cell: (u) => <RoleChip u={u} /> },
    { key: "verified", header: "Verified", size: 12, cell: (u) => <VerifiedMark verified={u.verified} /> },
    {
      key: "joined",
      header: "Joined",
      size: 16,
      sort: { active: sortCol === "created", dir: sortDir, onSort: () => sortBy("created") },
      cell: (u) => <span className="adm-num">{fmtDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div className="adm-page">
      <PageHead title="Users" lead="Display name, role and verification only. No email or contact detail exists." />
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          {/* One filter group per row on phones: role, then verification. */}
          <div className="adm-filters">
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
            </Scroller>
            <Scroller>
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
          <SearchBox value={search} onChange={setSearch} label="Search users by name" placeholder="Search by name" />
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
                meta: [<VerifiedMark verified={u.verified} key="v" />, <span className="adm-num" key="j">Joined {fmtDate(u.createdAt)}</span>],
              })}
              empty={q ? `No users match “${q}”.` : "No users with these filters."}
            />
          </>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={state.data.items.length} total={state.data.total} noun={["user", "users"]} onPage={setPage} />
        )}
      </div>
      {/* Opened once the rows are here: the sheet sizes to its content, so it must not grow while loading. */}
      {openId && rows && <UserDrawer user={rows.find((u) => u.id === openId)} loading={false} showAccount={!readOnly} onClose={() => openDetail(null)} />}
    </div>
  );
}

/** Built from the row already loaded: the API has no per-user read, and needs none. */
function UserDrawer({ user: u, loading, showAccount, onClose }: { user?: AdminUser; loading: boolean; showAccount: boolean; onClose: () => void }) {
  return (
    <Drawer
      title={u ? u.displayName : "User"}
      label="User"
      summary={
        u && {
          lead: (
            <span className="adm-avatar adm-avatar--lg" aria-hidden="true">
              {initials(u.displayName)}
            </span>
          ),
          pill: <RoleChip u={u} />,
          facts: [
            ["Verified", <VerifiedMark verified={u.verified} text />],
            ["Joined", <span className="adm-num">{fmtDate(u.createdAt)}</span>],
            ["Short id", <span className="mono adm-ref">{u.shortId}</span>],
          ],
        }
      }
      onClose={onClose}
    >
      {!u && !loading && <Empty>This user is not in the current list. Search by name to find them.</Empty>}
      {u && (
        <section className="adm-section">
          <SectionLabel>Details</SectionLabel>
          <dl className="adm-facts">
            {showAccount && (
              <>
                <dt>Account</dt>
                <dd>{accountText(u)}</dd>
              </>
            )}
            <dt>Contact</dt>
            <dd className="adm-muted">None stored. ROAAMM keeps no email or phone number.</dd>
          </dl>
        </section>
      )}
    </Drawer>
  );
}
