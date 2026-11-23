import { Card } from "../../components/Card";

/** What a real account stores, said plainly (ADR 0005). */
export function PrivacyNote() {
  return (
    <Card as="section" className="auth__card" aria-label="Privacy">
      <h2 className="auth__h2">What we keep</h2>
      <p className="auth__muted">
        Your display name, your role, and your passkey's public key. No email, no phone number, no
        IP address, no password. Accounts with no sign-in for 90 days are deleted. Everything you
        see inside is still simulated data.
      </p>
    </Card>
  );
}
