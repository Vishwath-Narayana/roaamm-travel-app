#!/usr/bin/env node
// Passkey round trip against a running core, with a software authenticator.
//   node scripts/ci/passkey-smoke.mjs http://localhost:9090
// Keys are generated in memory for this run only; nothing is read or stored.
// Checks: admin signup refused, register, /v1/me, logout, login, recovery.

import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:9090";
const WEB = "https://roaamm.plinthwell.com";
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (buf) => createHash("sha256").update(buf).digest();

// ---- minimal CBOR (ints, byte strings, text, maps)
function cbor(v) {
  const head = (major, n) => {
    const mt = major << 5;
    if (n < 24) return Buffer.from([mt | n]);
    if (n < 256) return Buffer.from([mt | 24, n]);
    if (n < 65536) return Buffer.from([mt | 25, n >> 8, n & 255]);
    const b = Buffer.alloc(5);
    b[0] = mt | 26;
    b.writeUInt32BE(n, 1);
    return b;
  };
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (typeof v === "string") {
    const b = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, b.length), b]);
  }
  const entries = v instanceof Map ? [...v] : Object.entries(v);
  return Buffer.concat([
    head(5, entries.length),
    ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)]),
  ]);
}

// ---- software authenticator
class SoftKey {
  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    this.jwk = publicKey.export({ format: "jwk" });
    this.credentialId = randomBytes(32);
    this.userHandle = null;
  }
  flags(extra = 0) {
    return 0x01 | 0x04 | 0x08 | 0x10 | extra; // UP, UV, BE, BS
  }
  clientData(type, challenge, origin) {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }
  create(publicKey, origin = WEB) {
    this.userHandle = Buffer.from(publicKey.user.id, "base64url");
    const cose = cbor(
      new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(this.jwk.x, "base64url")],
        [-3, Buffer.from(this.jwk.y, "base64url")],
      ]),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(Buffer.from(publicKey.rp.id)),
      Buffer.from([this.flags(0x40)]),
      Buffer.alloc(4), // sign count 0
      Buffer.alloc(16), // AAGUID
      idLen,
      this.credentialId,
      cose,
    ]);
    const att = cbor(
      new Map([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]),
    );
    const id = b64u(this.credentialId);
    return {
      id,
      rawId: id,
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        clientDataJSON: b64u(this.clientData("webauthn.create", publicKey.challenge, origin)),
        attestationObject: b64u(att),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }
  get(publicKey, origin = WEB) {
    const clientData = this.clientData("webauthn.get", publicKey.challenge, origin);
    const authData = Buffer.concat([
      sha256(Buffer.from(publicKey.rpId)),
      Buffer.from([this.flags()]),
      Buffer.alloc(4),
    ]);
    const signature = sign(
      "sha256",
      Buffer.concat([authData, sha256(clientData)]),
      this.privateKey,
    );
    const id = b64u(this.credentialId);
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: b64u(this.userHandle),
      },
      clientExtensionResults: {},
    };
  }
}

// ---- HTTP with a cookie jar of one
let cookie = "";
async function call(method, path, body) {
  const headers = { Origin: WEB, "X-Roaamm-Csrf": "1", "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) {
    const m = /^__Host-roaamm_session=([^;]*)/.exec(set);
    cookie = m && m[1] ? `__Host-roaamm_session=${m[1]}` : "";
  }
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

function expect(cond, what) {
  if (!cond) {
    console.error(`passkey smoke FAILED: ${what}`);
    process.exit(1);
  }
}

const admin = await call("POST", "/v1/auth/register/options", {
  displayName: "Nope",
  role: "admin",
});
expect(admin.status === 400 && admin.json.error === "invalid_role", "admin signup must be refused");

// The API host is not the web origin: a passkey made "for" it must be refused.
const bad = await call("POST", "/v1/auth/register/options", {
  displayName: "Wrong",
  role: "guide",
});
const badVerify = await call("POST", "/v1/auth/register/verify", {
  challengeId: bad.json.challengeId,
  credential: new SoftKey().create(bad.json.publicKey, "https://roaamm-api.plinthwell.com"),
});
expect(
  badVerify.status === 400 && badVerify.json.error === "passkey_not_accepted",
  "wrong origin refused",
);

const key = new SoftKey();
const reg = await call("POST", "/v1/auth/register/options", {
  displayName: "Smoke Test",
  role: "traveller",
});
expect(reg.status === 200, `register/options ${reg.status}`);
const created = await call("POST", "/v1/auth/register/verify", {
  challengeId: reg.json.challengeId,
  credential: key.create(reg.json.publicKey),
});
expect(created.status === 200, `register/verify ${created.status} ${JSON.stringify(created.json)}`);
expect(
  created.json.isDemo === false && created.json.recoveryCodes?.length === 8,
  "signup returns 8 codes",
);

let me = await call("GET", "/v1/me");
expect(
  me.status === 200 && me.json.displayName === "Smoke Test" && me.json.isDemo === false,
  "me after signup",
);

expect((await call("POST", "/v1/logout")).status === 204, "logout");
expect((await call("GET", "/v1/me")).status === 401, "me after logout");

const login = await call("POST", "/v1/auth/login/options");
expect(login.status === 200 && login.json.publicKey.allowCredentials.length === 0, "login/options");
const signedIn = await call("POST", "/v1/auth/login/verify", {
  challengeId: login.json.challengeId,
  credential: key.get(login.json.publicKey),
});
expect(signedIn.status === 200, `login/verify ${signedIn.status} ${JSON.stringify(signedIn.json)}`);
me = await call("GET", "/v1/me");
expect(me.status === 200 && me.json.role === "traveller", "me after login");

const list = await call("GET", "/v1/me/credentials");
expect(list.status === 200 && list.json.credentials.length === 1, "credentials list");

expect((await call("POST", "/v1/logout")).status === 204, "second logout");
const recovered = await call("POST", "/v1/auth/recovery", { code: created.json.recoveryCodes[0] });
expect(recovered.status === 200 && recovered.json.needsNewPasskey === true, "recovery sign-in");
expect(
  (await call("POST", "/v1/auth/recovery", { code: created.json.recoveryCodes[0] })).status === 401,
  "recovery code is single use",
);

console.log(
  "passkey smoke ok: admin refused, wrong origin refused, register, me, logout, login, credentials, recovery",
);
