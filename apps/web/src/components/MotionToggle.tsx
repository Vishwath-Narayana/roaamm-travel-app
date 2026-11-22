import { usePrefersReducedMotion, useSystemPrefersReducedMotion } from "../motion";
import { setMotionReduced } from "../motion/preference";
import "./MotionToggle.css";

/**
 * "Reduce motion" switch for the footer. It can only reduce: when the
 * operating system already asks for reduced motion it shows as on, cannot be
 * turned off here, and says why.
 */
export function MotionToggle() {
  const reduced = usePrefersReducedMotion();
  const bySystem = useSystemPrefersReducedMotion();
  return (
    <div className="motion-toggle">
      <button
        type="button"
        role="switch"
        aria-checked={reduced}
        aria-describedby={bySystem ? "motion-toggle-note" : undefined}
        disabled={bySystem}
        className="motion-toggle__switch"
        onClick={() => setMotionReduced(!reduced)}
      >
        <span className="motion-toggle__track" aria-hidden="true">
          <span className="motion-toggle__thumb" />
        </span>
        Reduce motion
      </button>
      {bySystem && (
        <p id="motion-toggle-note" className="motion-toggle__note">
          On in your system settings
        </p>
      )}
    </div>
  );
}
