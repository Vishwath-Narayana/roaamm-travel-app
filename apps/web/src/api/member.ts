// A traveller's or guide's own data (M4a endpoints, used by the M4c apps).
// The server only ever returns the signed-in user's own rows: another user's
// trip id answers 404. Trip notes are private: they come back only to their
// owner, never to an admin. Reads share the 30 s cache with the admin console;
// every write clears it.

import { cachedGet, clearAdminCache, query, type TripStatus } from "./admin";
import { write } from "./session";

/** Limits the API enforces (TripService, GuideApplicationService). */
export const TRIP_LIMITS = { title: 80, destination: 80, notes: 500 } as const;
export const GUIDE_LIMITS = { headline: 80, bio: 600, city: 40, languages: 5, cities: 5 } as const;

export type Trip = {
  id: string;
  title: string;
  destination: string;
  /** Calendar dates, 2026-05-01. */
  startDate: string;
  endDate: string;
  status: TripStatus;
  /** Private to the owner. Missing when empty. */
  notes?: string;
  /** One of the fixed simulated demo trips: read-only. */
  sample: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TripList = {
  items: Trip[];
  page: number;
  size: number;
  hasMore: boolean;
  total?: number | null;
  counts: Record<"total" | TripStatus, number>;
  max: number;
};

export type TripInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  notes: string;
  status?: TripStatus;
};

export function myTrips(
  p: { when?: "all" | "upcoming" | "past"; status?: TripStatus | ""; q?: string; page?: number; size?: number },
  signal?: AbortSignal,
): Promise<TripList> {
  return cachedGet(`/v1/trips${query(p)}`, signal);
}

export function myTrip(id: string, signal?: AbortSignal): Promise<Trip> {
  return cachedGet(`/v1/trips/${encodeURIComponent(id)}`, signal);
}

async function send<T>(path: string, body: unknown, method: string): Promise<T> {
  try {
    return (await (await write(path, body, method)).json()) as T;
  } finally {
    clearAdminCache();
  }
}

export const createTrip = (t: TripInput) => send<Trip>("/v1/trips", t, "POST");
export const updateTrip = (id: string, t: Partial<TripInput>) =>
  send<Trip>(`/v1/trips/${encodeURIComponent(id)}`, t, "PATCH");

// ---- guide application

export type MyApplication = {
  id: string;
  status: "submitted" | "in_review" | "approved" | "rejected";
  headline: string;
  bio: string;
  languages: string[];
  cities: string[];
  /** The reviewer's note: the reason, for a rejection. */
  decisionNote?: string;
  createdAt: string;
  reviewedAt?: string;
  decidedAt?: string;
};

export type Mine = {
  status: "none" | MyApplication["status"];
  canApply: boolean;
  /** Why canApply is false: not_verified, already_guide or already_open. */
  reason?: "not_verified" | "already_guide" | "already_open";
  application?: MyApplication;
};

export type ApplicationInput = Pick<MyApplication, "headline" | "bio" | "languages" | "cities">;

export function myApplication(signal?: AbortSignal): Promise<Mine> {
  return cachedGet("/v1/guide/application", signal);
}

/** A new application. After a rejection this is how the applicant resubmits. */
export const applyAsGuide = (a: ApplicationInput) => send<MyApplication>("/v1/guide/application", a, "POST");
