import { useEffect, useState } from "react";
import { STATUS_TEXT, TRIP_STATUSES, trips, type AdminTrip, type TripSort, type TripStatus } from "../../api/admin";
import { useSearchParams } from "../../router";
import { openDetail } from "../params";
import {
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Loading,
  Pager,
  Pill,
  SampleChip,
  Scroller,
  SearchBox,
  Segmented,
  fmtDay,
  useAdminData,
  useDebounced,
  type Column,
} from "../ui";

const SIZE = 20;
const dates = (t: AdminTrip) => `${fmtDay(t.startDate)} – ${fmtDay(t.endDate)}`;

/** Read-only: admins see title, place, dates and status, never a trip's notes. */
export function Trips() {
  const params = useSearchParams();
  const openId = params.get("id");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState<TripStatus | "">("");
  const [sort, setSort] = useState<TripSort>("start_desc");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, status, sort]);
  const { state, reload } = useAdminData(`trips:${q}:${status}:${sort}:${page}`, (s) =>
    trips({ q, status, sort, page, size: SIZE }, s),
  );
  const rows = state.data?.items;

  const columns: Column<AdminTrip>[] = [
    {
      key: "trip",
      header: "Trip",
      primary: true,
      cell: (t) => (
        <>
          <span className="adm-cell__text">{t.title}</span>
          {t.sample && <SampleChip />}
        </>
      ),
    },
    { key: "destination", header: "Destination", cell: (t) => t.destination },
    {
      key: "dates",
      header: "Dates",
      sort: { active: sort !== "created_desc", dir: sort === "start_asc" ? "asc" : "desc", onSort: () => setSort(sort === "start_desc" ? "start_asc" : "start_desc") },
      cell: (t) => <span className="adm-num">{dates(t)}</span>,
    },
    { key: "status", header: "Status", cell: (t) => <Pill status={t.status} /> },
    { key: "owner", header: "Owner", wide: true, cell: (t) => t.owner },
  ];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Trips</h1>
          <p className="adm-page__lead">Read-only. Trip notes are private to the traveller and never shown here.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          <SearchBox value={search} onChange={setSearch} label="Search trips by title, place or owner" placeholder="Search title, place or owner" />
          <Scroller>
            <Segmented<TripStatus | "">
              label="Status"
              value={status}
              onChange={setStatus}
              options={[{ value: "", label: "All" }, ...TRIP_STATUSES.map((s) => ({ value: s, label: STATUS_TEXT[s] }))]}
            />
          </Scroller>
        </div>
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <>
            {state.kind === "loading" && <Loading what="trips" />}
            <DataTable
              caption="Trips in your scope"
              columns={columns}
              rows={rows}
              busy={state.kind === "loading"}
              onOpen={(t) => openDetail(t.id)}
              phone={(t) => ({
                title: t.title,
                extra: t.sample ? <SampleChip /> : undefined,
                pill: <Pill status={t.status} />,
                meta: [t.destination, <span className="adm-num" key="d">{fmtDay(t.startDate)}</span>],
              })}
              empty={q ? `No trips match “${q}”.` : "No trips yet."}
            />
          </>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={state.data.items.length} total={state.data.total} noun={["trip", "trips"]} onPage={setPage} />
        )}
      </div>
      {openId && <TripDrawer trip={rows?.find((t) => t.id === openId)} loading={!rows} onClose={() => openDetail(null)} />}
    </div>
  );
}

/** Built from the row already loaded. Notes are private and never fetched. */
function TripDrawer({ trip: t, loading, onClose }: { trip?: AdminTrip; loading: boolean; onClose: () => void }) {
  return (
    <Drawer title={t ? t.title : "Trip"} onClose={onClose}>
      {!t && !loading && <Empty>This trip is not in the current list.</Empty>}
      {t && (
        <>
          <div className="adm-chips-row">
            <Pill status={t.status} />
            {t.sample && <SampleChip />}
          </div>
          <dl className="adm-facts">
            <dt>Destination</dt>
            <dd>{t.destination}</dd>
            <dt>Dates</dt>
            <dd className="adm-num">{dates(t)}</dd>
            <dt>Owner</dt>
            <dd>{t.owner}</dd>
            <dt>Notes</dt>
            <dd className="adm-muted">Private to the traveller. Admins never see them.</dd>
          </dl>
        </>
      )}
    </Drawer>
  );
}
