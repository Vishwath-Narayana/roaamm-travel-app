import {
  credentialToJSON,
  fromB64u,
  passkeysSupported,
  signIn,
  toB64u,
  PasskeyFailure,
} from "./passkeys";
import { installWebAuthn, mockApi, REQUEST, uninstallWebAuthn } from "../test/webauthn";

describe("passkeys helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallWebAuthn();
  });

  it("round-trips base64url", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const s = toB64u(bytes);
    expect(s).not.toMatch(/[+/=]/);
    expect(new Uint8Array(fromB64u(s))).toEqual(bytes);
  });

  it("serialises a credential without toJSON", () => {
    const buf = (n: number) => new Uint8Array([n, n]).buffer;
    const cred = {
      id: "AQE",
      rawId: buf(1),
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        clientDataJSON: buf(2),
        authenticatorData: buf(3),
        signature: buf(4),
        userHandle: buf(5),
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential;
    expect(credentialToJSON(cred)).toEqual({
      id: "AQE",
      rawId: "AQE",
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        clientDataJSON: "AgI",
        authenticatorData: "AwM",
        signature: "BAQ",
        userHandle: "BQU",
      },
      clientExtensionResults: {},
    });
  });

  it("knows when passkeys are unsupported", async () => {
    uninstallWebAuthn();
    expect(passkeysSupported()).toBe(false);
    mockApi({ "/v1/auth/login/options": [[200, REQUEST]] });
    await expect(signIn()).rejects.toMatchObject({ problem: "unsupported" });
  });

  it("tells a quick cancel from a timeout", async () => {
    mockApi({ "/v1/auth/login/options": [[200, REQUEST]] });
    installWebAuthn({ get: { reject: "NotAllowedError" } });
    await expect(signIn()).rejects.toMatchObject({ problem: "cancelled" });

    // Every clock read jumps past the 5 minute timeout.
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (t += 400_000));
    await expect(signIn()).rejects.toMatchObject({ problem: "timed_out" });
  });

  it("maps InvalidStateError to an already-registered passkey", async () => {
    mockApi({ "/v1/auth/login/options": [[200, REQUEST]] });
    installWebAuthn({ get: { reject: "InvalidStateError" } });
    const err = await signIn().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PasskeyFailure);
    expect((err as PasskeyFailure).problem).toBe("already_registered");
  });
});
