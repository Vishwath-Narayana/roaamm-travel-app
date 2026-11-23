import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installWebAuthn, mockApi, REQUEST, uninstallWebAuthn } from "../../test/webauthn";
import { Account } from "./Account";

const ME = { role: "traveller", displayName: "Asha", isDemo: false, needsNewPasskey: false };
const LIST = {
  credentials: [
    {
      id: "k1",
      label: "Laptop",
      createdAt: "2026-11-01T10:00:00Z",
      lastUsedAt: null,
      backedUp: true,
      transports: [],
    },
    {
      id: "k2",
      label: null,
      createdAt: "2026-11-02T10:00:00Z",
      lastUsedAt: null,
      backedUp: false,
      transports: [],
    },
  ],
  recoveryCodesRemaining: 6,
};

describe("Account", () => {
  beforeEach(() => window.history.replaceState(null, "", "/account"));
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallWebAuthn();
  });

  it("lists passkeys and recovery codes left", async () => {
    installWebAuthn();
    mockApi({ "/v1/me": [[200, ME]], "/v1/me/credentials": [[200, LIST]] });
    render(<Account />);
    expect(await screen.findByText("Signed in as Asha · Traveller")).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getByText("Laptop")).toBeInTheDocument();
    expect(within(list).getByText("Passkey 2")).toBeInTheDocument();
    expect(within(list).getByText("Synced")).toBeInTheDocument();
    expect(screen.getByText(/6 of 8 unused/)).toBeInTheDocument();
    // The privacy note is on the account page too.
    expect(screen.getByRole("region", { name: "Privacy" })).toHaveTextContent(
      /No email, no phone number, no IP address.*no sign-in for 90 days are deleted/,
    );
  });

  it("asks for a fresh passkey check before removing, then retries", async () => {
    const { get } = installWebAuthn();
    const { calls } = mockApi({
      "/v1/me": [[200, ME]],
      "/v1/me/credentials": [[200, LIST]],
      "/v1/me/credentials/k1": [
        [403, { error: "reauth_required" }],
        [204, null],
      ],
      "/v1/me/reauth/options": [[200, REQUEST]],
      "/v1/me/reauth/verify": [[204, null]],
    });
    render(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Laptop" }));
    await vi.waitFor(() => expect(screen.getByText("Laptop removed.")).toBeInTheDocument());
    expect(get).toHaveBeenCalledTimes(1);
    const deletes = calls.filter((c) => c.path === "/v1/me/credentials/k1");
    expect(deletes).toHaveLength(2);
    expect(deletes[0]!.init!.method).toBe("DELETE");
    expect(new Headers(deletes[0]!.init!.headers).get("X-Roaamm-Csrf")).toBe("1");
  });

  it("explains why the last passkey can't be removed", async () => {
    installWebAuthn();
    mockApi({
      "/v1/me": [[200, ME]],
      "/v1/me/credentials": [
        [200, { ...LIST, credentials: [LIST.credentials[0]], recoveryCodesRemaining: 0 }],
      ],
      "/v1/me/credentials/k1": [[409, { error: "last_passkey" }]],
    });
    render(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Laptop" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/can't remove your only passkey/);
  });

  it("after a recovery sign-in, asks for a new passkey first", async () => {
    const { create } = installWebAuthn();
    mockApi({
      "/v1/me": [
        [200, { ...ME, needsNewPasskey: true }],
        [200, ME],
      ],
      "/v1/me/credentials": [[200, LIST]],
      "/v1/me/credentials/options": [
        [
          200,
          {
            challengeId: "a1",
            publicKey: {
              ...REQUEST.publicKey,
              rp: { id: "r", name: "R" },
              user: { id: "AA", name: "A", displayName: "A" },
              pubKeyCredParams: [],
              attestation: "none",
              authenticatorSelection: {},
              excludeCredentials: [{ type: "public-key", id: "k1" }],
            },
          },
        ],
      ],
      "/v1/me/credentials/verify": [[204, null]],
    });
    render(<Account />);
    expect(await screen.findByText(/signed in with a recovery code/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to your dashboard" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    await vi.waitFor(() => expect(screen.getByText("Passkey added.")).toBeInTheDocument());
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/signed in with a recovery code/)).not.toBeInTheDocument();
  });

  it("shows new recovery codes once after regenerating", async () => {
    installWebAuthn();
    mockApi({
      "/v1/me": [[200, ME]],
      "/v1/me/credentials": [[200, LIST]],
      "/v1/me/recovery-codes/regenerate": [[200, { recoveryCodes: ["2222-3333-4444-5555"] }]],
    });
    render(<Account />);
    await userEvent.click(await screen.findByRole("button", { name: "Make new recovery codes" }));
    expect(await screen.findByText("2222-3333-4444-5555")).toBeInTheDocument();
    expect(screen.getByText("Your old codes no longer work.")).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in, and tells demo users they have no passkeys", async () => {
    installWebAuthn();
    mockApi({ "/v1/me": [[401, { error: "unauthenticated" }]] });
    const { unmount } = render(<Account />);
    await vi.waitFor(() => expect(window.location.pathname).toBe("/login"));
    unmount();
    vi.restoreAllMocks();

    mockApi({ "/v1/me": [[200, { role: "guide", displayName: "Demo guide", isDemo: true }]] });
    render(<Account />);
    expect(await screen.findByText(/shared demo account/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your own account" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
