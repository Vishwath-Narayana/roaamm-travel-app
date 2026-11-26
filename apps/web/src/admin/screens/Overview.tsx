import type { ReactNode } from "react";
import {
  ACTION_TEXT,
  applications,
  audit,
  overview,
  verificationQueue,
  type Application,
  type AuditRow,
  type Kpi,
} from "../../api/admin";
import type { AdminRequest } from "../../api/verification";
import { Link } from "../../router";
import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CompassIcon,
  MapIcon,
  UsersIcon,
  XIcon,
} from "../icons";
import {
  Empty,
  ErrorState,
  PageHead,
  Pill,
  SkeletonBlock,
  fmtDate,
  Loading,
  relTime,
  useAdminData,
} from "../ui";
import { SubjectChip, subjectHref } from "./Audit";

type KpiKey = "users" | "pendingVerifications" | "pendingGuideApplications" | "trips";

/**
 * `queue`: a count of work waiting. New items there are not good news, so its
 * pill stays neutral. `short`: the phone label, one line in a half-width card,
 * so every number in a row sits on the same baseline.
 */
const KPIS: { key: KpiKey; label: string; short: string; icon: typeof UsersIcon; href: string; queue: boolean }[] =
  [
    { key: "users", label: "Users", short: "Users", icon: UsersIcon, href: "/app/admin/users", queue: false },
    {
      key: "pendingVerifications",
      label: "Pending verifications",
      short: "Pending",
      icon: BadgeCheckIcon,
      href: "/app/admin/verification",
      queue: true,
    },
    {
      key: "pendingGuideApplications",
      label: "Open guide applications",
      short: "Open applications",
      icon: CompassIcon,
      href: "/app/admin/guide-applications",
      queue: true,
    },
    { key: "trips", label: "Trips", short: "Trips", icon: MapIcon, href: "/app/admin/trips", queue: false },
  ];

const RECENT = 8;
const number = new Intl.NumberFormat();

/**
 * One KPI: the value, then the absolute number of new items in the last 30
 * days (never a percentage: on small numbers "+400%" says nothing), and the
 * previous 30 days for comparison.
 */
export function KpiCard({
  label,
  short,
  kpi,
  icon: Icon,
  href,
  queue,
}: {
  label: string;
  /** Shown below 768 px (the full label stays for screen readers). */
  short?: string;
  kpi?: Kpi;
  icon: typeof UsersIcon;
  href: string;
  queue: boolean;
}) {
  const fresh = kpi?.last30 ?? 0;
  // One rule (docs/design-system.md): green only for a good change, that is
  // more new items than the prior 30 days on a growth number. Queues, no
  // change and fewer are neutral grey.
  const tone = !queue && kpi && fresh > kpi.prev30 ? "good" : "neutral";
  return (
    <li className="adm-kpi">
      <div className="adm-kpi__top">
        <span className="adm-kpi__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <span className="adm-kpi__label">
          <span className={short && short !== label ? "adm-long" : undefined}>{label}</span>
          {short && short !== label && (
            <span className="adm-short" aria-hidden="true">
              {short}
            </span>
          )}
        </span>
        <Link className="adm-kpi__link" href={href} aria-label={`Open ${label.toLowerCase()}`}>
          <ArrowUpRightIcon size={16} />
        </Link>
      </div>
      {/* The same rows loaded or not, each with a fixed height: nothing moves when data arrives. */}
      <p className="adm-kpi__value">
        {kpi ? (
          <>
            <span className="adm-kpi__number">{number.format(kpi.value)}</span>
            <span className={`adm-delta adm-delta--${tone}`}>
              {fresh > 0 ? `+${number.format(fresh)} in 30 days` : "None new in 30 days"}
            </span>
          </>
        ) : (
          <span className="adm-skeleton adm-kpi__skeleton" aria-hidden="true" />
        )}
      </p>
      <p className="adm-kpi__foot">
        {kpi ? (
          <>
            <span className="adm-long">vs {number.format(kpi.prev30)} in the previous 30 days</span>
            <span className="adm-short" aria-hidden="true">
              vs {number.format(kpi.prev30)} prior 30 days
            </span>
          </>
        ) : (
          <span className="adm-skeleton" aria-hidden="true" />
        )}
      </p>
    </li>
  );
}

export function Overview() {
  const { state, reload } = useAdminData("overview", (s) => overview(s));
  const pendingV = useAdminData("overview:pending-verifications", (s) =>
    verificationQueue({ status: "pending" }, s),
  );
  const openApps = useAdminData("overview:open-applications", async (s) => {
    const [a, b] = await Promise.all([
      applications({ status: "submitted", size: 5 }, s),
      applications({ status: "in_review", size: 5 }, s),
    ]);
    return [...b.items, ...a.items].slice(0, 5);
  });
  const recent = useAdminData("audit:0", (s) => audit(0, s));
  const data = state.data;
  // The lists render once, after the numbers and all three lists have answered
  // (or failed): nothing exists below the KPI row to be pushed while loading,
  // so there is no layout shift.
  const settled = [{ state }, pendingV, openApps, recent].every(
    (l) => l.state.data !== undefined || l.state.kind === "error",
  );

  return (
    <div className="adm-page">
      <PageHead title="Overview" lead="Counts for your scope, compared with the previous 30 days." />
      {state.kind === "error" && !data ? (
        <section className="adm-card">
          <ErrorState message={state.message} onRetry={reload} />
        </section>
      ) : (
        <ul className="adm-kpis" aria-label="Key numbers" aria-busy={state.kind === "loading"}>
          {KPIS.map((k) => (
            <KpiCard
              key={k.key}
              label={k.label}
              short={k.short}
              kpi={data?.[k.key]}
              icon={k.icon}
              href={k.href}
              queue={k.queue}
            />
          ))}
        </ul>
      )}

      {!settled && <Loading what="the overview lists" />}
      {settled && (
        <div className="adm-page adm-page--lists">
          <div className="adm-grid-2">
            <section className="adm-card adm-card--list" aria-labelledby="att-verif">
              <header className="adm-card__head">
                <h2 id="att-verif">Pending verifications</h2>
                <Link href="/app/admin/verification" className="adm-card__more">
                  View all
                </Link>
              </header>
              <CardList
                load={pendingV}
                empty="Nothing waiting. Every verification request is decided."
                render={(r: AdminRequest) => (
                  <Link className="adm-line" href={`/app/admin/verification?id=${r.id}`}>
                    <span className="adm-line__title">{r.userDisplayName}</span>
                    <span className="adm-line__meta">{fmtDate(r.createdAt)}</span>
                    <Pill status={r.status} />
                    <ChevronIcon size={16} className="adm-line__chev" />
                  </Link>
                )}
                items={(d) => d.items.slice(0, 5)}
              />
            </section>
            <section className="adm-card adm-card--list" aria-labelledby="att-apps">
              <header className="adm-card__head">
                <h2 id="att-apps">Open guide applications</h2>
                <Link href="/app/admin/guide-applications" className="adm-card__more">
                  View all
                </Link>
              </header>
              <CardList
                load={openApps}
                empty="No open applications."
                render={(a: Application) => (
                  <Link className="adm-line" href={`/app/admin/guide-applications?id=${a.id}`}>
                    <span className="adm-line__title">{a.applicant}</span>
                    <span className="adm-line__meta">{fmtDate(a.createdAt)}</span>
                    <Pill status={a.status} />
                    <ChevronIcon size={16} className="adm-line__chev" />
                  </Link>
                )}
                items={(d) => d}
              />
            </section>
          </div>

          <section className="adm-card adm-card--list" aria-labelledby="recent">
            <header className="adm-card__head">
              <h2 id="recent">Recent activity</h2>
              <Link href="/app/admin/audit" className="adm-card__more">
                Audit log
              </Link>
            </header>
            <CardList
              load={recent}
              empty="No admin actions yet."
              render={(a: AuditRow) => <ActivityRow entry={a} />}
              items={(d) => d.items.slice(0, RECENT)}
            />
          </section>
        </div>
      )}
    </div>
  );
}

/** A small muted icon for the kind of action (no avatar: the actor is named in the row). */
function ActionIcon({ action }: { action: string }) {
  const Icon = action.endsWith(".approve")
    ? CheckIcon
    : action.endsWith(".reject")
      ? XIcon
      : action === "guide_application.review"
        ? ClockIcon
        : CompassIcon;
  return (
    <span className="adm-activity__icon" aria-hidden="true">
      <Icon size={16} />
    </span>
  );
}

/** One audit entry: who did what to whom, and when. Opens the subject's drawer. */
export function ActivityRow({ entry: a }: { entry: AuditRow }) {
  const who = a.admin ?? "Deleted account";
  const href = subjectHref(a);
  const body = (
    <>
      <ActionIcon action={a.action} />
      <span className="adm-activity__what">
        <span className="adm-activity__action">{ACTION_TEXT[a.action] ?? a.action}</span>
        <span className="adm-activity__who">
          <span className="adm-activity__actor">{who}</span>
          <span className="adm-row__sep" aria-hidden="true">
            ·
          </span>
          <SubjectChip entry={a} />
          <span className="adm-activity__subject">{a.target ?? "Deleted"}</span>
        </span>
      </span>
      <time className="adm-activity__when" dateTime={a.createdAt} title={fmtDate(a.createdAt)}>
        {relTime(a.createdAt)}
      </time>
      {href && <ChevronIcon size={16} className="adm-line__chev" />}
    </>
  );
  return href ? (
    <Link className="adm-line adm-activity" href={href}>
      {body}
    </Link>
  ) : (
    <div className="adm-line adm-activity">{body}</div>
  );
}

function CardList<D, T extends { id: string }>({
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
  if (state.kind === "error" && !state.data)
    return <ErrorState message={state.message} onRetry={reload} />;
  if (!state.data) return <SkeletonBlock lines={4} />;
  const rows = items(state.data);
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="adm-lines">
      {rows.map((r) => (
        <li key={r.id}>{render(r)}</li>
      ))}
    </ul>
  );
}
