// Simulated ID verification (docs/adr/0006-simulated-verification.md).
// Loaded only by the dashboards. No real ID is ever sent: only a document type.

import { call, write } from "./session";

export const DOC_TYPES = ["passport", "national_id", "driving_licence"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_LABEL: Record<DocType, string> = {
  passport: "Passport",
  national_id: "National ID card",
  driving_licence: "Driving licence",
};

export type Status = "none" | "pending" | "verified" | "rejected";
export const STATUS_LABEL: Record<Status, string> = {
  none: "Not verified",
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

export type MyVerification = {
  status: Status;
  docType?: DocType;
  sampleRef?: string;
  reason?: string;
  createdAt?: string;
  decidedAt?: string;
};

export type AdminRequest = {
  id: string;
  userDisplayName: string;
  userRole: "traveller" | "guide";
  docType: DocType;
  sampleRef: string;
  status: Exclude<Status, "none">;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
};

export type AuditEntry = {
  id: string;
  admin: string | null;
  action: string;
  targetId: string;
  createdAt: string;
};

export type Page<T> = { items: T[]; page: number; hasMore: boolean };

export async function myVerification(): Promise<MyVerification> {
  return (await call("/v1/verification/me")).json();
}

/** Sends the document type only. */
export async function submitVerification(docType: DocType): Promise<MyVerification> {
  return (await write("/v1/verification/requests", { docType })).json();
}

export async function adminQueue(
  status: Exclude<Status, "none">,
  page: number,
): Promise<Page<AdminRequest>> {
  return (await call(`/v1/admin/verification?status=${status}&page=${page}`)).json();
}

export async function adminRequest(id: string): Promise<AdminRequest> {
  return (await call(`/v1/admin/verification/${encodeURIComponent(id)}`)).json();
}

export async function decide(
  id: string,
  decision: "approve" | "reject",
  reason?: string,
): Promise<AdminRequest> {
  return (
    await write(`/v1/admin/verification/${encodeURIComponent(id)}/decision`, { decision, reason })
  ).json();
}

export async function auditLog(page: number): Promise<Page<AuditEntry>> {
  return (await call(`/v1/admin/audit?page=${page}`)).json();
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
export const when = (iso?: string) => (iso ? dateTime.format(new Date(iso)) : "—");
