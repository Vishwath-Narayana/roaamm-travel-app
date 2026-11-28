import type { ComponentType, SVGProps } from "react";
import {
  BadgeCheckIcon,
  ClockIcon,
  CompassIcon,
  GridIcon,
  LifebuoyIcon,
  MapIcon,
  ServerIcon,
  TicketIcon,
  UsersIcon,
} from "./icons";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export type NavItem = { slug: string; label: string; href: string; icon: Icon };
export type SoonItem = { label: string; milestone: string; icon: Icon };
/** One labelled group of the sidebar: pages, or features planned for later milestones. */
export type NavGroup = { label: string; items?: NavItem[]; soon?: SoonItem[] };

export const BASE = "/app/admin";

export const MAIN: NavItem[] = [
  { slug: "", label: "Overview", href: BASE, icon: GridIcon },
  { slug: "verification", label: "Verification", href: `${BASE}/verification`, icon: BadgeCheckIcon },
  { slug: "guide-applications", label: "Guide applications", href: `${BASE}/guide-applications`, icon: CompassIcon },
  { slug: "users", label: "Users", href: `${BASE}/users`, icon: UsersIcon },
  { slug: "trips", label: "Trips", href: `${BASE}/trips`, icon: MapIcon },
];

export const RECORDS: NavItem[] = [{ slug: "audit", label: "Audit log", href: `${BASE}/audit`, icon: ClockIcon }];

export const SOON: SoonItem[] = [
  { label: "Safety", milestone: "M8", icon: LifebuoyIcon },
  { label: "Bookings", milestone: "M9", icon: TicketIcon },
  { label: "System", milestone: "M10", icon: ServerIcon },
];

export const PAGES: NavItem[] = [...MAIN, ...RECORDS];

export const ADMIN_GROUPS: NavGroup[] = [
  { label: "Main", items: MAIN },
  { label: "Records", items: RECORDS },
  { label: "Coming soon", soon: SOON },
];

/** The screen slug for a path under /app/admin, or null if it is not one. */
export function slugOf(path: string): string | null {
  if (path === BASE) return "";
  const m = /^\/app\/admin\/([a-z-]+)$/.exec(path);
  return m && PAGES.some((p) => p.slug === m[1]) ? m[1]! : null;
}
