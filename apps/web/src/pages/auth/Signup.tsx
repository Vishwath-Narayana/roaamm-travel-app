import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { passkeysSupported, signUp, type RealRole } from "../../api/passkeys";
import { dashboardPath } from "../../api/session";
import { Link, navigate, usePageTitle } from "../../router";
import { isSignupsPaused, problemText } from "./messages";
import { PrivacyNote } from "./PrivacyNote";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import "../Demo.css";
import "./auth.css";

const ROLES: { role: RealRole; label: string; body: string }[] = [
  { role: "traveller", label: "Traveller", body: "Plan trips and meet people on your dates." },
  { role: "guide", label: "Guide", body: "Offer your time by the hour to travellers." },
];

export function Signup() {
  usePageTitle("Create an account");
  const supported = passkeysSupported();
  const [name, setName] = useState("");
  const [role, setRole] = useState<RealRole>("traveller");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState<{ role: RealRole; codes: string[] } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await signUp(name, role);
      setDone({ role: me.role as RealRole, codes: me.recoveryCodes ?? [] });
    } catch (err) {
      setPaused(isSignupsPaused(err));
      setError(problemText(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="container page auth">
        <header className="page__head">
          <h1>Account created</h1>
          <p className="page__lead">One last step before you go in.</p>
        </header>
        <RecoveryCodesPanel
          codes={done.codes}
          doneLabel="Go to your dashboard"
          onDone={() => navigate(dashboardPath(done.role), { replace: true })}
        />
      </div>
    );
  }

  return (
    <div className="container page auth">
      <header className="page__head">
        <h1>Create an account</h1>
        <p className="page__lead">
          No password and no email: your device makes a passkey, unlocked with your fingerprint,
          face or screen lock.
        </p>
      </header>

      <div aria-live="assertive">
        {!supported && (
          <p className="demo__error" role="alert">
            This browser or device can't use passkeys. Try an up-to-date browser on a phone or
            computer with a screen lock, or <Link href="/demo">try the demo</Link>.
          </p>
        )}
        {error && (
          <p className="demo__error" role="alert">
            {error} {paused && <Link href="/demo">Try the demo</Link>}
          </p>
        )}
      </div>

      <form className="auth__form" onSubmit={submit} noValidate>
        <Input
          label="Display name"
          hint="1 to 40 characters. Other people will see this."
          name="displayName"
          autoComplete="nickname"
          maxLength={40}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="auth__roles">
          <legend>I'm joining as</legend>
          {ROLES.map((r) => (
            <label key={r.role} className="auth__choice">
              <input
                type="radio"
                name="role"
                value={r.role}
                checked={role === r.role}
                onChange={() => setRole(r.role)}
              />
              <span>
                <strong>{r.label}</strong> <span className="auth__muted">{r.body}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="auth__row">
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={busy || !supported || name.trim() === ""}
          >
            {busy ? "Waiting for your passkey…" : "Create passkey"}
          </Button>
        </div>
      </form>

      <p className="auth__links">
        <Link href="/login">I already have an account</Link>
        <Link href="/demo">Try the demo instead</Link>
      </p>

      <div className="demo__section">
        <PrivacyNote />
      </div>
    </div>
  );
}
