import { PASSKEY_MESSAGES, PasskeyFailure } from "../../api/passkeys";
import { ApiFailure, errorMessage } from "../../api/session";

/** One honest sentence for anything a passkey flow can throw. */
export function problemText(e: unknown): string {
  if (e instanceof PasskeyFailure) return PASSKEY_MESSAGES[e.problem];
  if (e instanceof ApiFailure) return errorMessage(e.error);
  return errorMessage({ kind: "unavailable" });
}

export function isSignupsPaused(e: unknown): boolean {
  return e instanceof ApiFailure && e.error.kind === "signups_paused";
}

export function needsReauth(e: unknown): boolean {
  return (
    e instanceof ApiFailure && e.error.kind === "rejected" && e.error.code === "reauth_required"
  );
}
