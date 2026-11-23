// The admin console API (M4a, docs/adr/0008-guide-applications.md). Every read
// is scoped by the server: the demo admin only ever gets demo rows, a real
// admin only real rows. The UI never assumes otherwise.
//
// Reads go through a small in-memory cache (30 s per URL) so moving between
// screens and tabs does not refetch; every mutation clears it.

import { call, write } from "./session";
import type { AdminRequest, AuditEntry, Page } from "./verification";

export const CACHE_MS = 30_000;

const cache = new Map<string, { at: number; data: unknown }>();

/** A GET that reuses a response younger than 30 s. Aborts with `signal`. */
export async function cachedGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
  const data = (await (await call(path, { signal })).json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

/** Drops every cached read, so the next screen shows fresh data after a change. */
export function clearAdminCache(): void {
  cache.clear();
}

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function mutate<T>(path: string, body?: unknown): Promise<T> {
  try {
    return (await (await write(path, body)).json()) as T;
  } finally {
    clearAdminCache();
  }
}

// ---- overview

/** `change` is null when the previous 30 days had nothing to compare with. */
export type Kpi = { value: number; last30: number; prev30: number; change: number | null };

export type Overview = {
  scope: "demo" | "real";
  users: Kpi;
  pendingVerifications: Kpi;
  pendingGuideApplications: Kpi;
  trips: Kpi;
  tripsByStatus: Record<TripStatus, number>;
  generatedAt: string;
};

export const overview = (signal?: AbortSignal) => cachedGet<Overview>("/v1/admin/overview", signal);

// ---- users

export type AdminUser = {
  id: string;
  shortId: string;
  displayName: string;
  role: "traveller" | "guide" | "admin";
  verified: boolean;
  demo: boolean;
  sample: boolean;
  createdAt: string;
};

export type Paged<T> = { items: T[]; page: number; size: number; hasMore: boolean; total: number | null };

export type UserSort = "created_desc" | "created_asc" | "name_asc" | "name_desc";

export function users(
  p: { q?: string; role?: string; verified?: string; sort?: UserSort; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return cachedGet<Paged<AdminUser>>(`/v1/admin/users${query(p)}`, signal);
}

// ---- trips (read-only, never notes)

export type TripStatus = "planned" | "ongoing" | "completed" | "cancelled";
export const TRIP_STATUSES: TripStatus[] = ["planned", "ongoing", "completed", "cancelled"];

export type AdminTrip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  owner: string;
  sample: boolean;
  createdAt: string;
};

export type TripSort = "start_desc" | "start_asc" | "created_desc";

export function trips(
  p: { q?: string; status?: string; sort?: TripSort; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return cachedGet<Paged<AdminTrip>>(`/v1/admin/trips${query(p)}`, signal);
}

// ---- verification (M3 endpoints, with M4a counts, search, history and bulk)

export type VerificationStatus = "pending" | "verified" | "rejected";
export const VERIFICATION_STATUSES: VerificationStatus[] = ["pending", "verified", "rejected"];

export type HistoryEvent = { action: string; admin: string | null; at: string };

export type VerificationQueue = Page<AdminRequest> & { counts: Record<VerificationStatus, number> };
export type VerificationDetail = AdminRequest & { history?: HistoryEvent[] };

export function verificationQueue(
  p: { status: VerificationStatus; q?: string; page?: number },
  signal?: AbortSignal,
) {
  return cachedGet<VerificationQueue>(`/v1/admin/verification${query(p)}`, signal);
}

export function verificationDetail(id: string, signal?: AbortSignal) {
  return cachedGet<VerificationDetail>(`/v1/admin/verification/${encodeURIComponent(id)}`, signal);
}

export function decideVerification(id: string, decision: Decision, reason?: string) {
  return mutate<AdminRequest>(`/v1/admin/verification/${encodeURIComponent(id)}/decision`, {
    decision,
    reason,
  });
}

// ---- guide applications

export type AppStatus = "submitted" | "in_review" | "approved" | "rejected";
export const APP_STATUSES: AppStatus[] = ["submitted", "in_review", "approved", "rejected"];

export type Application = {
  id: string;
  applicantId: string;
  applicant: string;
  applicantRole: string;
  applicantVerified: boolean;
  status: AppStatus;
  headline: string;
  bio: string;
  languages: string[];
  cities: string[];
  reviewer?: string;
  decisionNote?: string;
  createdAt: string;
  reviewedAt?: string;
  decidedAt?: string;
  sample: boolean;
  history?: HistoryEvent[];
};

export type ApplicationList = Paged<Application> & { counts: Record<AppStatus | "total", number> };

export function applications(
  p: { status?: AppStatus; page?: number; size?: number },
  signal?: AbortSignal,
) {
  return cachedGet<ApplicationList>(`/v1/admin/guide-applications${query(p)}`, signal);
}

export function application(id: string, signal?: AbortSignal) {
  return cachedGet<Application>(`/v1/admin/guide-applications/${encodeURIComponent(id)}`, signal);
}

export function reviewApplication(id: string) {
  return mutate<Application>(`/v1/admin/guide-applications/${encodeURIComponent(id)}/review`);
}

export function decideApplication(id: string, decision: Decision, note?: string) {
  return mutate<Application>(`/v1/admin/guide-applications/${encodeURIComponent(id)}/decision`, {
    decision,
    note,
  });
}

// ---- bulk decisions (max 25 per request; no bulk delete exists)

export const BULK_MAX = 25;

export type Decision = "approve" | "reject";

export type RowResult = { id: string; ok: boolean; changed: boolean; status: string | null; error: string | null };
export type BulkResult = { decision: Decision; succeeded: number; failed: number; results: RowResult[] };

export function bulkDecide(kind: "verification" | "guide-applications", ids: string[], decision: Decision, note?: string) {
  if (ids.length < 1 || ids.length > BULK_MAX) throw new RangeError("1 to 25 ids");
  return mutate<BulkResult>(`/v1/admin/${kind}/bulk-decision`, { ids, decision, note });
}

// ---- audit log

export type AuditRow = AuditEntry & { targetType?: string };

export function audit(page: number, signal?: AbortSignal) {
  return cachedGet<Page<AuditRow>>(`/v1/admin/audit?page=${page}`, signal);
}

// ---- labels

export const STATUS_TEXT: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  planned: "Planned",
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ACTION_TEXT: Record<string, string> = {
  "verification.approve": "Approved verification",
  "verification.reject": "Rejected verification",
  "guide_application.review": "Moved application to review",
  "guide_application.approve": "Approved guide application",
  "guide_application.reject": "Rejected guide application",
  "user.role_to_guide": "Changed role to guide",
};

/** Language codes the API accepts (GuideApplicationService.LANGUAGES), in English. */
export const LANGUAGE_NAME: Record<string, string> = {
  ar: "Arabic",
  bn: "Bengali",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  kn: "Kannada",
  ko: "Korean",
  ml: "Malayalam",
  mr: "Marathi",
  nl: "Dutch",
  pt: "Portuguese",
  ru: "Russian",
  sw: "Swahili",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  vi: "Vietnamese",
  zh: "Chinese",
};
