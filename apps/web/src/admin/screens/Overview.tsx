import type { ReactNode } from "react";
import { applications, overview, verificationQueue, type Application, type Kpi } from "../../api/admin";
import type { AdminRequest } from "../../api/verification";
import { Link } from "../../router";
import { CompassIcon, BadgeCheckIcon, MapIcon, UsersIcon } from "../icons";
import { Empty, ErrorState, Pill, SampleChip, SkeletonBlock, fmtDate, useAdminData } from "../ui";

const KPIS: { key: "users" | "pendingVerifications" | "pendingGuideApplications" | "trips"; label: string; icon: typeof UsersIcon; href: string }[] = [
  { key: "users", label: "Users", icon: UsersIcon, href: "/app/admin/users" },
  { key: "pendingVerifications", label: "Pending verifications", icon: BadgeCheckIcon, href: "/app/admin/verification" },
  { key: "pendingGuideApplications", label: "Open guide applications", icon: CompassIcon, href: "/app/admin/guide-applications" },
  { key: "trips", label: "Trips", icon: MapIcon, href: "/app/admin/trips" },
];

const number = new Intl.NumberFormat();

/** The delta pill appears only when the API gives a change (it is null when there is nothing to compare). */
export function KpiCard({ label, kpi, icon: Icon, href }: { label: string; kpi?: Kpi; icon: typeof UsersIcon; href: string }) {
  const change = kpi?.change;
  return (
    <li className="adm-kpi">
      <div className="adm-kpi__top">
        <span className="adm-kpi__label">{label}</span>
        <Link className="adm-kpi__link" href={href} aria-label={`Open ${label.toLowerCase()}`}>
          <Icon size={16} />
        </Link>
      </div>
      {kpi ? (
        <>
          <p className="adm-kpi__value">
            {number.format(kpi.value)}
            {change != null && (
              <span className={`adm-delta adm-delta--${change > 0 ? "up" : change < 0 ? "down" : "flat"}`}>
                <span className="visually-hidden">{change > 0 ? "up " : change < 0 ? "down " : "no change "}</span>
                <span aria-hidden="true">{change > 0 ? "+" : ""}</span>
                {change}%
              </span>
            )}
          </p>
          <p className="adm-kpi__foot">
            {number.format(kpi.last30)} new in the last 30 days
            <span className="adm-kpi__vs"> vs {number.format(kpi.prev30)} in the previous 30 days</span>
          </p>
        </>
      ) : (
        <SkeletonBlock lines={2} />
      )}
    </li>
  );
}

export function Overview() {
  const { state, reload } = useAdminData("overview", (s) => overview(s));
  const pendingV = useAdminData("overview:pending-verifications", (s) => verificationQueue({ status: "pending" }, s));
  const openApps = useAdminData("overview:open-applications", async (s) => {
    const [a, b] = await Promise.all([
      applications({ status: "submitted", size: 5 }, s),
      applications({ status: "in_review", size: 5 }, s),
    ]);
    return [...b.items, ...a.items].slice(0, 6);
  });
  const data = state.data;

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Overview</h1>
          <p className="adm-page__lead">Counts for your scope, compared with the previous 30 days.</p>
        </div>
      </header>
      {state.kind === "error" && !data ? (
        <ErrorState message={state.message} onRetry={reload} />
      ) : (
        <ul className="adm-kpis" aria-label="Key numbers" aria-busy={state.kind === "loading"}>
          {KPIS.map((k) => (
            <KpiCard key={k.key} label={k.label} kpi={data?.[k.key]} icon={k.icon} href={k.href} />
          ))}
        </ul>
      )}

      <h2 className="adm-section-title">Needs attention</h2>
      <div className="adm-attention">
        <section className="adm-card" aria-labelledby="att-verif">
          <header className="adm-card__head">
            <h3 id="att-verif">Pending verifications</h3>
            <Link href="/app/admin/verification" className="adm-link">
              View all
            </Link>
          </header>
          <AttentionList
            load={pendingV}
            empty="Nothing waiting. Every verification request is decided."
            render={(r: AdminRequest) => (
              <Link className="adm-attention__row" href={`/app/admin/verification?id=${r.id}`}>
                <span className="adm-attention__name">{r.userDisplayName}</span>
                <span className="adm-attention__meta">{fmtDate(r.createdAt)}</span>
                <Pill status={r.status} />
              </Link>
            )}
            items={(d) => d.items.slice(0, 6)}
          />
        </section>
        <section className="adm-card" aria-labelledby="att-apps">
          <header className="adm-card__head">
            <h3 id="att-apps">Open guide applications</h3>
            <Link href="/app/admin/guide-applications" className="adm-link">
              View all
            </Link>
          </header>
          <AttentionList
            load={openApps}
            empty="No open applications."
            render={(a: Application) => (
              <Link className="adm-attention__row" href={`/app/admin/guide-applications?id=${a.id}`}>
                <span className="adm-attention__name">
                  {a.applicant}
                  {a.sample && <SampleChip />}
                </span>
                <span className="adm-attention__meta">{fmtDate(a.createdAt)}</span>
                <Pill status={a.status} />
              </Link>
            )}
            items={(d) => d}
          />
        </section>
      </div>
    </div>
  );
}

function AttentionList<D, T extends { id: string }>({
  load,
  items,
  render,
  empty,
}: {
  load: ReturnType<typeof useAdminData<D>>;
  items: (d: D) => T[];
  render: (t: T) => ReactNode;
  empty: string;
}) {
  const { state, reload } = load;
  if (state.kind === "error" && !state.data) return <ErrorState message={state.message} onRetry={reload} />;
  if (!state.data) return <SkeletonBlock lines={4} />;
  const rows = items(state.data);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="adm-attention__list">
      {rows.map((r) => (
        <li key={r.id}>{render(r)}</li>
      ))}
    </ul>
  );
}
