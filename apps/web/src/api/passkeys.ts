// Passkeys in the browser (docs/adr/0005-passkeys.md). Loaded only by the
// signup, login and account pages, never by the landing page.

import { call, lastRole, write, type Me, type Role } from "./session";

// ---- base64url <-> ArrayBuffer

export function fromB64u(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function toB64u(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---- options as the API sends them

type Descriptor = { type: "public-key"; id: string; transports?: string[] };

export type CreationOptionsJSON = {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout: number;
  attestation: AttestationConveyancePreference;
  authenticatorSelection: AuthenticatorSelectionCriteria;
  excludeCredentials: Descriptor[];
  extensions?: Record<string, unknown>;
};

export type RequestOptionsJSON = {
  challenge: string;
  rpId: string;
  timeout: number;
  userVerification: UserVerificationRequirement;
  allowCredentials: Descriptor[];
};

type WithChallenge<T> = { challengeId: string; publicKey: T };

const descriptor = (d: Descriptor): PublicKeyCredentialDescriptor => ({
  type: "public-key",
  id: fromB64u(d.id),
  transports: d.transports as AuthenticatorTransport[] | undefined,
});

export function toCreationOptions(o: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    ...o,
    challenge: fromB64u(o.challenge),
    user: { ...o.user, id: fromB64u(o.user.id) },
    excludeCredentials: o.excludeCredentials.map(descriptor),
  } as PublicKeyCredentialCreationOptions;
}

export function toRequestOptions(o: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    ...o,
    challenge: fromB64u(o.challenge),
    allowCredentials: o.allowCredentials.map(descriptor),
  };
}

/** The standard JSON form of a credential (what PublicKeyCredential.toJSON() returns). */
export function credentialToJSON(cred: PublicKeyCredential): unknown {
  const withJson = cred as PublicKeyCredential & { toJSON?: () => unknown };
  if (typeof withJson.toJSON === "function") return withJson.toJSON();
  const r = cred.response as AuthenticatorResponse &
    Partial<AuthenticatorAttestationResponse> &
    Partial<AuthenticatorAssertionResponse>;
  const response: Record<string, unknown> = { clientDataJSON: toB64u(r.clientDataJSON) };
  if (r.attestationObject) {
    response.attestationObject = toB64u(r.attestationObject);
    response.transports = r.getTransports?.() ?? [];
  }
  if (r.authenticatorData) response.authenticatorData = toB64u(r.authenticatorData);
  if (r.signature) response.signature = toB64u(r.signature);
  if (r.userHandle) response.userHandle = toB64u(r.userHandle);
  return {
    id: cred.id,
    rawId: toB64u(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    response,
    clientExtensionResults: cred.getClientExtensionResults?.() ?? {},
  };
}

// ---- the browser side, with honest errors

export type PasskeyProblem =
  "unsupported" | "cancelled" | "timed_out" | "already_registered" | "failed";

export class PasskeyFailure extends Error {
  constructor(readonly problem: PasskeyProblem) {
    super(problem);
  }
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export const PASSKEY_MESSAGES: Record<PasskeyProblem, string> = {
  unsupported:
    "This browser or device can't use passkeys. Try an up-to-date browser on a phone or computer with a screen lock, or try the demo.",
  cancelled: "The passkey request was cancelled. Try again when you're ready.",
  timed_out: "The passkey request timed out. Try again.",
  already_registered: "This device already has a passkey for this account.",
  failed: "Your device couldn't complete the passkey request. Try again, or use another device.",
};

/**
 * Browsers report both "cancelled" and "timed out" as NotAllowedError; the
 * elapsed time tells them apart.
 */
function problemFrom(e: unknown, startedAt: number, timeoutMs: number): PasskeyProblem {
  const name = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") {
    return performance.now() - startedAt >= timeoutMs - 1000 ? "timed_out" : "cancelled";
  }
  if (name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "already_registered";
  if (name === "NotSupportedError") return "unsupported";
  return "failed";
}

async function createCredential(o: CreationOptionsJSON): Promise<unknown> {
  if (!passkeysSupported()) throw new PasskeyFailure("unsupported");
  const startedAt = performance.now();
  try {
    const cred = (await navigator.credentials.create({
      publicKey: toCreationOptions(o),
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyFailure("cancelled");
    return credentialToJSON(cred);
  } catch (e) {
    if (e instanceof PasskeyFailure) throw e;
    throw new PasskeyFailure(problemFrom(e, startedAt, o.timeout));
  }
}

async function getCredential(o: RequestOptionsJSON): Promise<unknown> {
  if (!passkeysSupported()) throw new PasskeyFailure("unsupported");
  const startedAt = performance.now();
  try {
    const cred = (await navigator.credentials.get({
      publicKey: toRequestOptions(o),
    })) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyFailure("cancelled");
    return credentialToJSON(cred);
  } catch (e) {
    if (e instanceof PasskeyFailure) throw e;
    throw new PasskeyFailure(problemFrom(e, startedAt, o.timeout));
  }
}

// ---- API flows

export type SignedIn = Me & { recoveryCodes?: string[] | null };

export type RealRole = Exclude<Role, "admin">;

export async function signUp(displayName: string, role: RealRole): Promise<SignedIn> {
  const opts = (await (
    await write("/v1/auth/register/options", { displayName, role })
  ).json()) as WithChallenge<CreationOptionsJSON>;
  const credential = await createCredential(opts.publicKey);
  const res = await write("/v1/auth/register/verify", {
    challengeId: opts.challengeId,
    credential,
  });
  const me = (await res.json()) as SignedIn;
  lastRole.set(me.role);
  return me;
}

export async function signIn(): Promise<SignedIn> {
  const opts = (await (
    await write("/v1/auth/login/options")
  ).json()) as WithChallenge<RequestOptionsJSON>;
  const credential = await getCredential(opts.publicKey);
  const res = await write("/v1/auth/login/verify", { challengeId: opts.challengeId, credential });
  const me = (await res.json()) as SignedIn;
  lastRole.set(me.role);
  return me;
}

export async function signInWithRecoveryCode(code: string): Promise<SignedIn> {
  const me = (await (await write("/v1/auth/recovery", { code })).json()) as SignedIn;
  lastRole.set(me.role);
  return me;
}

export type CredentialInfo = {
  id: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  transports: string[];
};

export async function listCredentials(): Promise<{
  credentials: CredentialInfo[];
  recoveryCodesRemaining: number;
}> {
  return (await call("/v1/me/credentials")).json();
}

export async function addPasskey(label?: string): Promise<void> {
  const opts = (await (
    await write("/v1/me/credentials/options")
  ).json()) as WithChallenge<CreationOptionsJSON>;
  const credential = await createCredential(opts.publicKey);
  await write("/v1/me/credentials/verify", {
    challengeId: opts.challengeId,
    credential,
    label: label || undefined,
  });
}

/** A fresh passkey check, needed before removing a passkey or regenerating codes. */
export async function confirmWithPasskey(): Promise<void> {
  const opts = (await (
    await write("/v1/me/reauth/options")
  ).json()) as WithChallenge<RequestOptionsJSON>;
  const credential = await getCredential(opts.publicKey);
  await write("/v1/me/reauth/verify", { challengeId: opts.challengeId, credential });
}

export async function removePasskey(id: string): Promise<void> {
  await write(`/v1/me/credentials/${encodeURIComponent(id)}`, undefined, "DELETE");
}

export async function regenerateRecoveryCodes(): Promise<string[]> {
  return (
    (await (await write("/v1/me/recovery-codes/regenerate")).json()) as { recoveryCodes: string[] }
  ).recoveryCodes;
}
