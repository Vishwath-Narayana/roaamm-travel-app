import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installWebAuthn, mockApi, REQUEST, uninstallWebAuthn } from "../../test/webauthn";
import { Login } from "./Login";

describe("Login", () => {
  beforeEach(() => window.history.replaceState(null, "", "/login"));
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallWebAuthn();
  });

  it("signs in with a discoverable passkey and opens the dashboard", async () => {
    const { get } = installWebAuthn();
    mockApi({
      "/v1/auth/login/options": [[200, REQUEST]],
      "/v1/auth/login/verify": [
        [200, { role: "traveller", displayName: "Asha", isDemo: false, needsNewPasskey: false }],
      ],
    });
    render(<Login />);
    expect(screen.getByRole("link", { name: "Try the demo instead" })).toHaveAttribute(
      "href",
      "/demo",
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in with passkey" }));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/app/traveller"));
    const opts = get.mock.calls[0]![0] as CredentialRequestOptions;
    expect(opts.publicKey!.allowCredentials).toEqual([]);
    expect(opts.publicKey!.userVerification).toBe("required");
  });

  it("explains a passkey from another device without saying whether an account exists", async () => {
    installWebAuthn();
    mockApi({
      "/v1/auth/login/options": [[200, REQUEST]],
      "/v1/auth/login/verify": [[401, { error: "passkey_not_accepted" }]],
    });
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in with passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /wasn't accepted.*another device.*recovery code/,
    );
  });

  it("explains a timeout and a rate limit", async () => {
    installWebAuthn({ get: { reject: "NotAllowedError" } });
    mockApi({ "/v1/auth/login/options": [[200, REQUEST]] });
    // Every clock read jumps past the 5 minute timeout.
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (t += 400_000));
    render(<Login />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in with passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/timed out/);
    vi.restoreAllMocks();

    mockApi({
      "/v1/auth/login/options": [[429, { error: "rate_limited" }, { "retry-after": "120" }]],
    });
    await userEvent.click(screen.getByRole("button", { name: "Sign in with passkey" }));
    expect(await screen.findByText(/Try again in 2 minutes/)).toBeInTheDocument();
  });

  it("signs in with a recovery code and goes to add a passkey", async () => {
    installWebAuthn();
    const { calls } = mockApi({
      "/v1/auth/recovery": [
        [200, { role: "guide", displayName: "Asha", isDemo: false, needsNewPasskey: true }],
      ],
    });
    render(<Login />);
    const toggle = screen.getByRole("button", { name: /Use a recovery code/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await userEvent.type(screen.getByLabelText("Recovery code"), "aaaa-bbbb-cccc-dddd");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with code" }));
    await vi.waitFor(() => expect(window.location.pathname).toBe("/account"));
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ code: "aaaa-bbbb-cccc-dddd" });
  });

  it("explains a recovery code that didn't work", async () => {
    uninstallWebAuthn();
    mockApi({ "/v1/auth/recovery": [[401, { error: "recovery_code_not_accepted" }]] });
    render(<Login />);
    expect(screen.getByRole("alert")).toHaveTextContent(/can't use passkeys.*recovery code/);
    await userEvent.click(screen.getByRole("button", { name: /Use a recovery code/ }));
    await userEvent.type(screen.getByLabelText("Recovery code"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in with code" }));
    expect(await screen.findByText(/recovery code didn't work/)).toBeInTheDocument();
  });
});
