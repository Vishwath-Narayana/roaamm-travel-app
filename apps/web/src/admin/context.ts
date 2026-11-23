import { createContext, useContext } from "react";
import type { Me } from "../api/session";

export type AdminContextValue = {
  me: Me;
  /** The demo admin: every read works, every action control is disabled. */
  readOnly: boolean;
  /** The session ended (401): leave the console. */
  onSignedOut: () => void;
};

export const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const v = useContext(AdminContext);
  if (!v) throw new Error("useAdmin outside the admin console");
  return v;
}

/** Why an action control is unavailable (tooltip and accessible description). */
export const READ_ONLY_LABEL = "Demo is read-only";
export const FINAL_LABEL = "Decided: decisions are final";
