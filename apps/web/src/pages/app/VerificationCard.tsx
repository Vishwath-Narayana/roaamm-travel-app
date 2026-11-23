import { useCallback, useEffect, useId, useState } from "react";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import {
  DOC_LABEL,
  DOC_TYPES,
  STATUS_LABEL,
  myVerification,
  submitVerification,
  when,
  type DocType,
  type MyVerification,
} from "../../api/verification";
import { ApiFailure, errorMessage } from "../../api/session";
import "../auth/auth.css";

const SIMULATED = "Simulated: no real ID is collected.";

type Step = "idle" | "pick" | "confirm" | "sending";

/** A member's verification status and the simulated "Use sample ID" flow. */
export function VerificationCard({ onSignedOut }: { onSignedOut: () => void }) {
  const [state, setState] = useState<"loading" | MyVerification>("loading");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [docType, setDocType] = useState<DocType>("passport");
  const titleId = useId();
  const groupId = useId();

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiFailure && e.error.kind === "unauthenticated") {
        onSignedOut();
        return;
      }
      setError(errorMessage(e instanceof ApiFailure ? e.error : { kind: "unavailable" }));
    },
    [onSignedOut],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await myVerification());
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    setStep("sending");
    setError(null);
    try {
      setState(await submitVerification(docType));
      setStep("idle");
    } catch (e) {
      fail(e);
      setStep("confirm");
    }
  }

  const v = state === "loading" ? null : state;
  const canStart = v !== null && (v.status === "none" || v.status === "rejected");

  return (
    <Card as="section" className="dash__panel verify" aria-labelledby={titleId}>
      <div className="verify__head">
        <h2 id={titleId} className="dash__panel-title">
          ID verification
        </h2>
        {v && (
          <Badge variant={v.status === "verified" ? "verified" : "default"}>
            {STATUS_LABEL[v.status]}
          </Badge>
        )}
      </div>
      <p className="verify__simulated">{SIMULATED}</p>

      {state === "loading" && !error && <p role="status">Loading your verification status…</p>}
      {error && (
        <div role="alert" className="demo__error">
          {error}{" "}
          {state === "loading" && (
            <Button variant="ghost" onClick={() => void load()}>
              Try again
            </Button>
          )}
        </div>
      )}

      {v && step === "idle" && (
        <>
          {v.status === "none" && (
            <p>You're not verified yet. It takes one minute and no real document.</p>
          )}
          {v.status === "pending" && (
            <p>
              Your {v.docType ? DOC_LABEL[v.docType] : "sample ID"} ({v.sampleRef}) is waiting for
              an admin, sent {when(v.createdAt)}.
            </p>
          )}
          {v.status === "verified" && (
            <p>
              Verified on {when(v.decidedAt)} with a sample{" "}
              {v.docType ? DOC_LABEL[v.docType] : "ID"} ({v.sampleRef}).
            </p>
          )}
          {v.status === "rejected" && (
            <p>
              Rejected on {when(v.decidedAt)}. Reason: <strong>{v.reason}</strong> You can try
              again.
            </p>
          )}
          {canStart && (
            <Button onClick={() => setStep("pick")}>
              {v.status === "rejected" ? "Try again" : "Start verification"}
            </Button>
          )}
        </>
      )}

      {v && step === "pick" && (
        <div className="verify__flow">
          <fieldset className="auth__roles">
            <legend id={groupId}>Which document would you show?</legend>
            {DOC_TYPES.map((d) => (
              <label key={d} className="auth__choice">
                <input
                  type="radio"
                  name="docType"
                  value={d}
                  checked={docType === d}
                  onChange={() => setDocType(d)}
                />
                {DOC_LABEL[d]}
              </label>
            ))}
          </fieldset>
          <p className="auth__muted small">
            Nothing is uploaded. The server makes a sample reference instead of a real document.
          </p>
          <div className="dash__actions">
            <Button onClick={() => setStep("confirm")}>Use sample ID</Button>
            <Button variant="ghost" onClick={() => setStep("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {v && (step === "confirm" || step === "sending") && (
        <div className="verify__flow">
          <p>
            Send a sample <strong>{DOC_LABEL[docType]}</strong> for review? An admin will approve or
            reject it.
          </p>
          <div className="dash__actions">
            <Button
              onClick={() => void send()}
              loading={step === "sending"}
              disabled={step === "sending"}
            >
              Confirm
            </Button>
            <Button variant="ghost" onClick={() => setStep("pick")} disabled={step === "sending"}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
