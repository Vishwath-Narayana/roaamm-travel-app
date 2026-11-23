import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CREATION, installWebAuthn, mockApi, uninstallWebAuthn } from "../../test/webauthn";
import { Signup } from "./Signup";

const CODES = ["AAAA-BBBB-CCCC-DDDD", "EEEE-FFFF-GGGG-HHHH"];

describe("Signup", () => {
  beforeEach(() => window.history.replaceState(null, "", "/signup"));
  afterEach(() => {
    vi.restoreAllMocks();
    uninstallWebAuthn();
  });

  it("offers only Traveller and Guide, and needs a display name", () => {
    installWebAuthn();
    render(<Signup />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["traveller", "guide"]);
    expect(screen.queryByRole("radio", { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create passkey" })).toBeDisabled();
    expect(screen.getByText(/No email, no phone number, no IP address/)).toBeInTheDocument();
    expect(screen.getByText(/no sign-in for 90 days are deleted/)).toBeInTheDocument();
  });

  it("creates a passkey, shows the codes once, and continues only after 'I saved these'", async () => {
    const { create } = installWebAuthn();
    const { calls } = mockApi({
      "/v1/auth/register/options": [[200, CREATION]],
      "/v1/auth/register/verify": [
        [
          200,
          {
            role: "guide",
            displayName: "Asha",
            isDemo: false,
            needsNewPasskey: false,
            recoveryCodes: CODES,
          },
        ],
      ],
    });
    render(<Signup />);
    await userEvent.type(screen.getByLabelText("Display name"), "Asha");
    await userEvent.click(screen.getByRole("radio", { name: /Guide/ }));
    await userEvent.click(screen.getByRole("button", { name: "Create passkey" }));

    expect(
      await screen.findByRole("heading", { name: "Save your recovery codes" }),
    ).toBeInTheDocument();
    for (const c of CODES) expect(screen.getByText(c)).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({
      displayName: "Asha",
      role: "guide",
    });
    const verify = JSON.parse(String(calls[1]!.init!.body));
    expect(verify.challengeId).toBe("c1");
    expect(verify.credential.response.attestationObject).toBe("oA");
    expect(new Headers(calls[1]!.init!.headers).get("X-Roaamm-Csrf")).toBe("1");

    const go = screen.getByRole("button", { name: "Go to your dashboard" });
    expect(go).toBeDisabled();
    await userEvent.click(screen.getByLabelText("I saved these codes somewhere safe"));
    expect(go).toBeEnabled();
    await userEvent.click(go);
    expect(window.location.pathname).toBe("/app/guide");
  });

  it("copies the codes", async () => {
    installWebAuthn();
    mockApi({
      "/v1/auth/register/options": [[200, CREATION]],
      "/v1/auth/register/verify": [
        [200, { role: "traveller", displayName: "A", isDemo: false, recoveryCodes: CODES }],
      ],
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<Signup />);
    await userEvent.type(screen.getByLabelText("Display name"), "A");
    await userEvent.click(screen.getByRole("button", { name: "Create passkey" }));
    await userEvent.click(await screen.findByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
    expect(screen.getByText("Copied to the clipboard.")).toBeInTheDocument();
  });

  it("says when passkeys are not supported", () => {
    uninstallWebAuthn();
    render(<Signup />);
    expect(screen.getByRole("alert")).toHaveTextContent(/can't use passkeys/);
    expect(screen.getByRole("button", { name: "Create passkey" })).toBeDisabled();
  });

  it("says signups are paused and points to the demo", async () => {
    installWebAuthn();
    mockApi({ "/v1/auth/register/options": [[503, { error: "signups_paused" }]] });
    render(<Signup />);
    await userEvent.type(screen.getByLabelText("Display name"), "Asha");
    await userEvent.click(screen.getByRole("button", { name: "Create passkey" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Signups are paused for now. Try the demo instead.");
    expect(screen.getAllByRole("link", { name: /try the demo/i }).length).toBeGreaterThan(0);
  });

  it("explains a cancelled passkey prompt and an API outage", async () => {
    installWebAuthn({ create: { reject: "NotAllowedError" } });
    mockApi({ "/v1/auth/register/options": [[200, CREATION]] });
    render(<Signup />);
    await userEvent.type(screen.getByLabelText("Display name"), "Asha");
    await userEvent.click(screen.getByRole("button", { name: "Create passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled/);
    vi.restoreAllMocks();

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await userEvent.click(screen.getByRole("button", { name: "Create passkey" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/API is not answering/),
    );
  });
});
