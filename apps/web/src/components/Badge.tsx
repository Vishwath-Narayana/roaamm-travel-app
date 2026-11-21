import type { ReactNode } from "react";
import { CheckIcon } from "./icons";
import "./Badge.css";

export type BadgeProps = {
  variant?: "default" | "verified";
  children: ReactNode;
  className?: string;
};

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span className={["badge", `badge--${variant}`, className].filter(Boolean).join(" ")}>
      {variant === "verified" && <CheckIcon size={14} strokeWidth={2.5} data-testid="badge-check" />}
      {children}
    </span>
  );
}
