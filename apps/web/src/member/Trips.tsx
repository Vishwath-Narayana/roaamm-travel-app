// The traveller's trips list: the admin Trips table pattern (status tabs,
// search, skeleton rows, empty and error states, pages), for their own trips.
import { useEffect, useState } from "react";
import { STATUS_TEXT, TRIP_STATUSES, type TripStatus } from "../api/admin";
import { myTrips, type Trip, type TripList } from "../api/member";
import {
  DataTable,
  ErrorState,
  Loading,
  PageHead,
  Pager,
  Pill,
  Scroller,
  SearchBox,
  Segmented,
  fmtDay,
  unavailable,
  useDebounced,
  type Column,
} from "../admin/ui";
import { Link, navigate } from "../router";
import { SampleChip, useMine, useWriteBlock } from "./parts";

const SIZE = 10;
const BASE = "/app/traveller/trips";
const NONE: TripList = {
  items: [],
  page: 0,
  size: SIZE,
  hasMore: false,
  total: 0,
  counts: { total: 0, planned: 0, ongoing: 0, completed: 0, cancelled: 0 },
  max: 20,
};

export const tripDates = (t: Trip) => `${fmtDay(t.startDate)} – ${fmtDay(t.endDate)}`;

/** The title, then the Sample chip on the fixed simulated trips. */
export function TripTitle({ trip }: { trip: Trip }) {
  return (
    <>
      <span className="adm-cell__text">{trip.title}</span>
      {trip.sample && <SampleChip />}
    </>
  );
}

/** "New trip": a link, or the same control disabled with the reason. */
export function NewTripButton() {
  const block = useWriteBlock();
  return block ? (
    <span data-tip={block}>
      <button type="button" className="adm-btn adm-btn--primary" {...unavailable(block)}>
        New trip
      </button>
    </span>
  ) : (
    <Link href={`${BASE}/new`} className="adm-btn adm-btn--primary">
      New trip
    </Link>
  );
}

export function TripsList() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState<TripStatus | "">("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [q, status]);
  const { state, reload } = useMine(`trips:${q}:${status}:${page}`, (s) => myTrips({ q, status, page, size: SIZE }, s), NONE);
  const rows = state.data?.items;
  const filtered = Boolean(q || status);

  const columns: Column<Trip>[] = [
    { key: "trip", header: "Trip", primary: true, size: 34, cell: (t) => <TripTitle trip={t} /> },
    { key: "destination", header: "Destination", size: 22, cell: (t) => t.destination },
    { key: "dates", header: "Dates", size: 28, cell: (t) => <span className="adm-num">{tripDates(t)}</span> },
    { key: "status", header: "Status", size: 16, cell: (t) => <Pill status={t.status} /> },
  ];

  return (
    <div className="adm-page">
      <PageHead title="Trips" lead="Your trips. Notes stay private to you: no one else, admins included, can read them." actions={<NewTripButton />} />
      <div className="adm-card adm-card--flush">
        <div className="adm-toolbar">
          <Scroller>
            <Segmented<TripStatus | "">
              label="Status"
              value={status}
              onChange={setStatus}
              options={[{ value: "", label: "All" }, ...TRIP_STATUSES.map((s) => ({ value: s, label: STATUS_TEXT[s] }))]}
            />
          </Scroller>
          <SearchBox value={search} onChange={setSearch} label="Search your trips by title or place" placeholder="Search title or place" />
        </div>
        {state.kind === "error" && !state.data ? (
          <ErrorState message={state.message} onRetry={reload} />
        ) : (
          <>
            {state.kind === "loading" && <Loading what="your trips" />}
            <DataTable
              caption="Your trips"
              columns={columns}
              rows={rows}
              busy={state.kind === "loading"}
              onOpen={(t) => navigate(`${BASE}/${t.id}`)}
              phone={(t) => ({
                title: t.title,
                aside: t.sample ? <SampleChip /> : undefined,
                pill: <Pill status={t.status} />,
                meta: [t.destination, <span className="adm-num" key="d">{fmtDay(t.startDate)}</span>],
              })}
              empty={
                q
                  ? `No trips match “${q}”.`
                  : filtered
                    ? `No ${STATUS_TEXT[status]?.toLowerCase()} trips.`
                    : "No trips yet. Plan your first one with New trip."
              }
            />
          </>
        )}
        {state.data && (
          <Pager page={page} hasMore={state.data.hasMore} size={SIZE} shown={state.data.items.length} total={state.data.total} noun={["trip", "trips"]} onPage={setPage} />
        )}
      </div>
    </div>
  );
}
