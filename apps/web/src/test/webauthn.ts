// A fake navigator.credentials for tests. Returns objects shaped like real
// PublicKeyCredentials (with toJSON), or rejects like a browser does.

type Behaviour = (() => unknown) | { reject: string };

export function fakeCredential(kind: "create" | "get", id = "Y3JlZC1pZA") {
  const json =
    kind === "create"
      ? {
          id,
          rawId: id,
          type: "public-key",
          response: { clientDataJSON: "e30", attestationObject: "oA", transports: ["internal"] },
          clientExtensionResults: {},
        }
      : {
          id,
          rawId: id,
          type: "public-key",
          response: {
            clientDataJSON: "e30",
            authenticatorData: "AA",
            signature: "AA",
            userHandle: "AA",
          },
          clientExtensionResults: {},
        };
  return { id, type: "public-key", toJSON: () => json };
}

export function installWebAuthn(behaviour: { create?: Behaviour; get?: Behaviour } = {}) {
  // The options argument is recorded by vi.fn for tests to inspect.
  const run =
    (b: Behaviour | undefined, kind: "create" | "get") =>
    async (options?: CredentialRequestOptions) => {
      void options;
      if (b && typeof b === "object") throw new DOMException("refused", b.reject);
      return b ? b() : fakeCredential(kind);
    };
  const create = vi.fn(run(behaviour.create, "create"));
  const get = vi.fn(run(behaviour.get, "get"));
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { create, get } });
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = class {};
  return { create, get };
}

export function uninstallWebAuthn() {
  Object.defineProperty(navigator, "credentials", { configurable: true, value: undefined });
  delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
}

/** fetch mock answering by path, in order for repeated paths. */
export function mockApi(routes: Record<string, Array<[number, unknown, Record<string, string>?]>>) {
  const calls: { path: string; init: RequestInit | undefined }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, init });
    const queue = routes[path];
    if (!queue || queue.length === 0) throw new TypeError(`unexpected fetch ${path}`);
    const [status, body, headers] = queue.length > 1 ? queue.shift()! : queue[0]!;
    return new Response(body === null ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  });
  return { spy, calls };
}

export const CREATION = {
  challengeId: "c1",
  publicKey: {
    rp: { id: "roaamm.plinthwell.com", name: "ROAAMM" },
    user: { id: "AAAA", name: "Asha", displayName: "Asha" },
    challenge: "AAAA",
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 300000,
    attestation: "none",
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    excludeCredentials: [],
    extensions: { credProps: true },
  },
};

export const REQUEST = {
  challengeId: "c2",
  publicKey: {
    challenge: "AAAA",
    rpId: "roaamm.plinthwell.com",
    timeout: 300000,
    userVerification: "required",
    allowCredentials: [],
  },
};
