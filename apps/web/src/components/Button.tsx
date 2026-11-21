import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "../router";
import { ArrowRightIcon } from "./icons";
import "./Button.css";

type Common = {
  /**
   * primary: ink pill. secondary: outlined. ghost: text only.
   * inverse: white pill with ink text, for use over photos.
   * glass: translucent white pill, for use over photos.
   */
  variant?: "primary" | "secondary" | "ghost" | "inverse" | "glass";
  size?: "md" | "lg";
  /** Adds a trailing arrow that nudges right on hover. */
  arrow?: boolean;
  children: ReactNode;
  className?: string;
};

type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AsLink = Common & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export type ButtonProps = AsButton | AsLink;

/** A pill button, or a link styled as one when `href` is given. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", arrow = false, className, children, ...rest } = props;
  const cls = ["btn", `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(" ");
  const content = (
    <>
      {children}
      {arrow && <ArrowRightIcon size={18} className="btn__arrow" />}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as Omit<AsLink, keyof Common>;
    // Same-origin paths go through the router; #hash and external links stay native.
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={cls} {...anchor}>
          {content}
        </Link>
      );
    }
    return (
      <a href={href} className={cls} {...anchor}>
        {content}
      </a>
    );
  }
  const { type = "button", ...button } = rest as Omit<AsButton, keyof Common>;
  return (
    <button type={type} className={cls} {...button}>
      {content}
    </button>
  );
}
