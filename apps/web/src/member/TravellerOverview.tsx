// The traveller's home: the next trips, the ID check and the guide application.
import { myApplication, myTrips, type Mine, type TripList } from "../api/member";
import { ChevronIcon } from "../admin/icons";
import { Empty, ErrorState, Loading, PageHead, Pill, SkeletonBlock, fmtDay } from "../admin/ui";
import { Link } from "../router";
import { SampleChip, useMine } from "./parts";
import { NewTripButton } from "./Trips";
import { VerificationCard } from "./Verification";

const NO_TRIPS: TripList = {
  items: [],
  page: 0,
  size: 3,
  hasMore: false,
  counts: { total: 0, planned: 0, ongoing: 0, completed: 0, cancelled: 0 },
  max: 20,
};
const NO_APP: Mine = { status: "none", canApply: false };

export function TravellerOverview() {
  const trips = useMine("overview:trips", (s) => myTrips({ when: "upcoming", size: 3 }, s), NO_TRIPS);
  const app = useMine("application", (s) => myApplication(s), NO_APP);
  // Render the cards once both lists have answered: nothing is pushed while loading.
  const settled = [trips, app].every((l) => l.state.data !== undefined || l.state.kind === "error");

  return (
    <div className="adm-page">
      <PageHead title="Overview" lead="Your next trips, your ID check and your guide application." actions={<NewTripButton />} />
      {!settled && (
        <>
          <Loading what="your overview" />
          <section className="adm-card">
            <SkeletonBlock lines={4} />
          </section>
        </>
      )}
      {settled && (
        <>
          <section className="adm-card adm-card--list" aria-labelledby="next-trips">
            <header className="adm-card__head">
              <h2 id="next-trips">Upcoming trips</h2>
              <Link href="/app/traveller/trips" className="adm-card__more">
                All trips
              </Link>
            </header>
            {trips.state.kind === "error" && !trips.state.data ? (
              <ErrorState message={trips.state.message} onRetry={trips.reload} />
            ) : trips.state.data!.items.length === 0 ? (
              <Empty>No upcoming trips.</Empty>
            ) : (
              <ul className="adm-lines">
                {trips.state.data!.items.map((t) => (
                  <li key={t.id}>
                    <Link className="adm-line" href={`/app/traveller/trips/${t.id}`}>
                      <span className="adm-line__title">
                        {t.title} {t.sample && <SampleChip />}
                      </span>
                      <span className="adm-line__meta">
                        {t.destination} · {fmtDay(t.startDate)}
                      </span>
                      <Pill status={t.status} />
                      <ChevronIcon size={16} className="adm-line__chev" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="adm-grid-2">
            <VerificationCard />
            <ApplicationCard load={app} />
          </div>
        </>
      )}
    </div>
  );
}

function ApplicationCard({ load }: { load: ReturnType<typeof useMine<Mine>> }) {
  const { state, reload } = load;
  const m = state.data;
  return (
    <section className="adm-card adm-card__body" aria-labelledby="guide-app">
      <header className="adm-card__head">
        <h2 id="guide-app">Guide application</h2>
        {m && m.status !== "none" && <Pill status={m.status} />}
      </header>
      {!m ? (
        <ErrorState message={state.kind === "error" ? state.message : ""} onRetry={reload} />
      ) : (
        <>
          <p className="adm-note">
            {m.status === "none"
              ? "Know a city well? Apply to lead tours as a local guide."
              : m.status === "rejected"
                ? "Not approved this time. Read the reason, then edit and resubmit."
                : m.status === "approved"
                  ? "Approved. Your guide account is ready."
                  : "Submitted. An admin will review it."}
          </p>
          <p>
            <Link href="/app/traveller/become-a-guide" className="adm-btn adm-btn--secondary">
              {m.status === "none" ? "Become a guide" : "See your application"}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
