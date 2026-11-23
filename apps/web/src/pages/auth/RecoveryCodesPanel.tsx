import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";

type Props = {
  codes: string[];
  /** Called once the user confirms they saved the codes. */
  onDone: () => void;
  doneLabel: string;
};

/**
 * Recovery codes, shown once. They live only in this component's props: never
 * stored in the browser, never sent anywhere else.
 */
export function RecoveryCodesPanel({ codes, onDone, doneLabel }: Props) {
  const [saved, setSaved] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const titleId = useId();
  const checkId = useId();
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied to the clipboard.");
    } catch {
      setCopyStatus("Copy didn't work here. Select the codes and copy them, or download them.");
    }
  }

  function download() {
    const blob = new Blob(
      [`ROAAMM recovery codes\nEach code works once. Keep them somewhere safe.\n\n${text}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roaamm-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card as="section" className="auth__card" aria-labelledby={titleId}>
      <h2 id={titleId} className="auth__h2">
        Save your recovery codes
      </h2>
      <p className="auth__muted">
        If you lose your passkey, one of these codes signs you in once. This is the only time they
        are shown. We keep only a scrambled (hashed) copy, so we can't show them again.
      </p>
      <ol className="auth__codes mono" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="auth__row">
        <Button variant="secondary" onClick={copy}>
          Copy
        </Button>
        <Button variant="secondary" onClick={download}>
          Download
        </Button>
        <span className="auth__muted small" role="status">
          {copyStatus}
        </span>
      </div>
      <div className="auth__check">
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <label htmlFor={checkId}>I saved these codes somewhere safe</label>
      </div>
      <Button onClick={onDone} disabled={!saved} arrow>
        {doneLabel}
      </Button>
    </Card>
  );
}
