import { useId, useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { passkeysSupported, signIn, signInWithRecoveryCode } from "../../api/passkeys";
import { dashboardPath } from "../../api/session";
import { Link, navigate, usePageTitle } from "../../router";
import { problemText } from "./messages";
import "../Demo.css";
import "./auth.css";

export function Login() {
  usePageTitle("Sign in");
  const supported = passkeysSupported();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [code, setCode] = useState("");
  const recoveryId = useId();

  async function withPasskey() {
    setBusy(true);
    setError(null);
    try {
      const me = await signIn();
      navigate(me.needsNewPasskey ? "/account" : dashboardPath(me.role), { replace: true });
    } catch (e) {
      setError(problemText(e));
      setBusy(false);
    }
  }

  async function withCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithRecoveryCode(code);
      // A recovery sign-in must add a new passkey before anything else.
      navigate("/account", { replace: true });
    } catch (err) {
      setError(problemText(err));
      setBusy(false);
    }
  }

  return (
    <div className="container page auth">
      <header className="page__head">
        <h1>Sign in</h1>
        <p className="page__lead">
          Use the passkey you created for ROAAMM. There's nothing to type.
        </p>
      </header>

      <div aria-live="assertive">
        {!supported && (
          <p className="demo__error" role="alert">
            This browser or device can't use passkeys. Use a recovery code below, or{" "}
            <Link href="/demo">try the demo</Link>.
          </p>
        )}
        {error && (
          <p className="demo__error" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="auth__row">
        <Button
          size="lg"
          onClick={withPasskey}
          loading={busy && !showRecovery}
          disabled={busy || !supported}
        >
          {busy && !showRecovery ? "Waiting for your passkey…" : "Sign in with passkey"}
        </Button>
      </div>

      <div className="demo__section">
        <Button
          variant="ghost"
          aria-expanded={showRecovery}
          aria-controls={recoveryId}
          onClick={() => setShowRecovery((v) => !v)}
        >
          Lost your passkey? Use a recovery code
        </Button>
        <div id={recoveryId} hidden={!showRecovery}>
          <form className="auth__form" onSubmit={withCode} noValidate>
            <Input
              label="Recovery code"
              hint="16 characters, like ABCD-EFGH-JKMN-PQRS. Each code works once."
              name="code"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="auth__row">
              <Button
                type="submit"
                variant="secondary"
                loading={busy && showRecovery}
                disabled={busy || !code.trim()}
              >
                Sign in with code
              </Button>
            </div>
          </form>
        </div>
      </div>

      <p className="auth__links">
        <Link href="/signup">Create an account</Link>
        <Link href="/demo">Try the demo instead</Link>
      </p>
    </div>
  );
}
