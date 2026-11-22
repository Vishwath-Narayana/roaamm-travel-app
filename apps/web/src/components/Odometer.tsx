import type { CSSProperties } from "react";
import "./Odometer.css";

type OdometerProps = {
  /** The final text, e.g. "212k", "1,326" or "EUR 84". */
  value: string;
  /** While false every digit rests on 0; when true they roll to the value. */
  run?: boolean;
  /** Reserve room for this many characters so a changing value never shifts layout. */
  minChars?: number;
  className?: string;
};

const DIGITS = "0123456789";

/**
 * Digits roll like an odometer: each digit is a column of 0-9 moved with
 * translate (ease-out-expo, a small left-to-right stagger). Other characters
 * (commas, letters, spaces) stay put. Screen readers get the final value once,
 * as plain text; the rolling copy is aria-hidden.
 */
export function Odometer({ value, run = true, minChars, className }: OdometerProps) {
  const chars = [...value];
  return (
    <span
      className={["odo", className].filter(Boolean).join(" ")}
      style={minChars ? ({ minWidth: `${minChars}ch` } as CSSProperties) : undefined}
    >
      <span className="visually-hidden">{value}</span>
      <span className="odo__roll" aria-hidden="true" data-testid="odo" data-value={value} data-run={run}>
        {chars.map((ch, i) => {
          // Keyed from the right, so digits keep their column when the length changes.
          const key = chars.length - i;
          if (!DIGITS.includes(ch)) {
            return (
              <span key={`c${key}`} className="odo__char">
                {ch}
              </span>
            );
          }
          const digit = run ? Number(ch) : 0;
          return (
            <span key={`d${key}`} className="odo__col" style={{ "--i": i } as CSSProperties}>
              <span className="odo__strip" style={{ "--d": digit } as CSSProperties} data-digit={digit}>
                {DIGITS.split("").map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
