import { useEffect, useState } from "react";
import { STATUS_TEXT, TRIP_STATUSES, trips, type TripSort, type TripStatus } from "../../api/admin";
import { SortHeader } from "../SortHeader";
import {
  Empty,
  ErrorState,
  Loading,
  Pager,
  Pill,
  SampleChip,
  SearchBox,
  Segmented,
  SkeletonRows,
  fmtDay,
  useAdminData,
  useDebounced,
} from "../ui";

const SIZE = 20;

/** Read-only: admins see title, place, dates and status, never a trip's notes. */
export function Trips() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState<TripStatus | "">("");
  const [sort, setSort] = useState<TripSort>("start_desc");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, status, sort]);
  const { state, reload } = useAdminData(`trips:${q}:${status}:${sort}:${page}`, (s) =>
    trips({ q, status, sort, page, size: SIZE }, s),
  );
  const rows = state.data?.items ?? [];

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Trips</h1>
          <p className="adm-page__lead">Read-only. Trip notes are private to the traveller and never shown here.</p>
        </div>
      </header>
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar adm-toolbar--wrap">
          <SearchBox value={search} onChange={setSearch} label="Search trips by title, place or owner" placeholder="Search title, place or owner" />
          <Segmented<TripStatus | "">
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "All" }, ...TRIP_STATUSES.map((s) => ({ value: s, label: STATUS_TEXT[s] }))]}
          />
        </div>
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <div className="adm-table-wrap">
            {state.kind === "loading" && <Loading what="trips" />}
            <table className="adm-table" aria-busy={state.kind === "loading"}>
              <caption className="visually-hidden">Trips in your scope</caption>
              <thead>
                <tr>
                  <th scope="col">Trip</th>
                  <th scope="col">Destination</th>
                  <SortHeader
                    label="Dates"
                    active={sort !== "created_desc"}
                    dir={sort === "start_asc" ? "asc" : "desc"}
                    onSort={() => setSort(sort === "start_desc" ? "start_asc" : "start_desc")}
                  />
                  <th scope="col">Status</th>
                  <th scope="col">Owner</th>
                </tr>
              </thead>
              <tbody>
                {!state.data && <SkeletonRows cols={5} />}
                {state.data &&
                  rows.map((t) => (
                    <tr key={t.id}>
                      <th scope="row" data-label="Trip">
                        {t.title}
                        {t.sample && <SampleChip />}
                      </th>
                      <td data-label="Destination">{t.destination}</td>
                      <td data-label="Dates" className="adm-nowrap">
                        {fmtDay(t.startDate)} – {fmtDay(t.endDate)}
                      </td>
                      <td data-label="Status">
                        <Pill status={t.status} />
                      </td>
                      <td data-label="Owner">{t.owner}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {state.data && rows.length === 0 && <Empty>{q ? `No trips match “${q}”.` : "No trips yet."}</Empty>}
          </div>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={rows.length} total={state.data.total} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
