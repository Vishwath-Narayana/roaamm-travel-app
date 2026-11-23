import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Input } from "../../components/Input";
import {
  addPasskey,
  confirmWithPasskey,
  listCredentials,
  passkeysSupported,
  regenerateRecoveryCodes,
  removePasskey,
  type CredentialInfo,
} from "../../api/passkeys";
import { ApiFailure, dashboardPath, getMe, type Me } from "../../api/session";
import { Link, navigate, usePageTitle } from "../../router";
import { needsReauth, problemText } from "./messages";
import { PrivacyNote } from "./PrivacyNote";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import "../Demo.css";
import "./auth.css";

type Loaded = { me: Me; credentials: CredentialInfo[]; codesLeft: number };

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "never");

/** Runs an action; if the core wants a fresh passkey check first, does it and retries once. */
async function withFreshCheck<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    if (!needsReauth(e)) throw e;
    await confirmWithPasskey();
    return action();
  }
}

export function Account() {
  usePageTitle("Your account");
  const [state, setState] = useState<"loading" | "error" | Loaded>("loading");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await getMe();
      if (me.isDemo) {
        setState({ me, credentials: [], codesLeft: 0 });
        return;
      }
      const list = await listCredentials();
      setState({ me, credentials: list.credentials, codesLeft: list.recoveryCodesRemaining });
    } catch (e) {
      if (e instanceof ApiFailure && e.error.kind === "unauthenticated") {
        navigate("/login", { replace: true });
        return;
      }
      setError(problemText(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<void>, done: string) {
    setBusy(key);
    setError(null);
    setStatus("");
    try {
      await action();
      setStatus(done);
      await load();
    } catch (e) {
      setError(problemText(e));
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading") {
    return (
      <div className="container page auth" aria-busy="true">
        <header className="page__head">
          <h1>Your account</h1>
          <p className="page__lead" role="status">
            Loading your account…
          </p>
        </header>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="container page auth">
        <header className="page__head">
          <h1>Your account</h1>
          <p className="demo__error" role="alert">
            {error}
          </p>
        </header>
        <Button onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  const { me, credentials, codesLeft } = state;

  if (me.isDemo) {
    return (
      <div className="container page auth">
        <header className="page__head">
          <h1>Your account</h1>
          <p className="page__lead">
            You're in a shared demo account, which has no passkeys or recovery codes.
          </p>
        </header>
        <p className="auth__links">
          <Link href="/signup">Create your own account</Link>
          <Link href={dashboardPath(me.role)}>Back to the demo dashboard</Link>
        </p>
      </div>
    );
  }

  if (newCodes) {
    return (
      <div className="container page auth">
        <header className="page__head">
          <h1>New recovery codes</h1>
          <p className="page__lead">Your old codes no longer work.</p>
        </header>
        <RecoveryCodesPanel
          codes={newCodes}
          doneLabel="Back to your account"
          onDone={() => setNewCodes(null)}
        />
      </div>
    );
  }

  const mustAdd = me.needsNewPasskey === true;

  return (
    <div className="container page auth">
      <header className="page__head">
        <h1>Your account</h1>
        <p className="page__lead">
          Signed in as {me.displayName} · {me.role === "guide" ? "Guide" : "Traveller"}
        </p>
      </header>

      {mustAdd && (
        <p className="auth__notice" role="status">
          You signed in with a recovery code. Add a new passkey now so you can sign in next time.
        </p>
      )}
      <div aria-live="assertive">
        {error && (
          <p className="demo__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="visually-hidden" role="status">
        {status}
      </p>

      <Card as="section" className="auth__card" aria-labelledby="passkeys-title">
        <h2 id="passkeys-title" className="auth__h2">
          Passkeys
        </h2>
        {credentials.length === 0 ? (
          <p className="auth__muted">No passkeys yet.</p>
        ) : (
          <ul className="auth__passkeys">
            {credentials.map((c, i) => {
              const name = c.label ?? `Passkey ${i + 1}`;
              return (
                <li key={c.id} className="auth__passkey">
                  <span>
                    <strong>{name}</strong> {c.backedUp && <Badge>Synced</Badge>}
                    <br />
                    <span className="auth__muted small">
                      Added {fmt(c.createdAt)} · last used {fmt(c.lastUsedAt)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    loading={busy === c.id}
                    disabled={busy !== null}
                    aria-label={`Remove ${name}`}
                    onClick={() =>
                      run(c.id, () => withFreshCheck(() => removePasskey(c.id)), `${name} removed.`)
                    }
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <Input
          label="Name for a new passkey (optional)"
          hint="For example, the device it's on."
          maxLength={40}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="auth__row">
          <Button
            variant={mustAdd ? "primary" : "secondary"}
            loading={busy === "add"}
            disabled={busy !== null || !passkeysSupported()}
            onClick={() =>
              run(
                "add",
                async () => {
                  await addPasskey(label.trim());
                  setLabel("");
                },
                "Passkey added.",
              )
            }
          >
            Add a passkey
          </Button>
        </div>
      </Card>

      <Card as="section" className="auth__card demo__section" aria-labelledby="codes-title">
        <h2 id="codes-title" className="auth__h2">
          Recovery codes
        </h2>
        <p className="auth__muted">
          {codesLeft} of 8 unused. Making new codes replaces all the old ones and needs your
          passkey.
        </p>
        <div className="auth__row">
          <Button
            variant="secondary"
            loading={busy === "codes"}
            disabled={busy !== null || credentials.length === 0}
            onClick={() =>
              run(
                "codes",
                async () => setNewCodes(await withFreshCheck(regenerateRecoveryCodes)),
                "New recovery codes made.",
              )
            }
          >
            Make new recovery codes
          </Button>
        </div>
      </Card>

      <div className="demo__section">
        <PrivacyNote />
      </div>

      {!mustAdd && (
        <p className="auth__links">
          <Link href={dashboardPath(me.role)}>Back to your dashboard</Link>
        </p>
      )}
    </div>
  );
}
