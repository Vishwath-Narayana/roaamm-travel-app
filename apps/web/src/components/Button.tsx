import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "../router";
import "./Button.css";

type Common = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  children: ReactNode;
  className?: string;
};

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = AsButton | AsLink;

/** A button, or a link styled as one when `href` is given. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, ...rest } = props;
  const cls = ["btn", `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(" ");

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as AsLink;
    // Same-origin paths go through the router; #hash and external links stay native.
    if (href.startsWith("/")) return <Link href={href} className={cls} {...anchor} />;
    return <a href={href} className={cls} {...anchor} />;
  }
  const { type = "button", ...button } = rest as AsButton;
  return <button type={type} className={cls} {...button} />;
}
