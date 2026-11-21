import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "li" | "section";
  elevated?: boolean;
  children: ReactNode;
};

export function Card({ as: Tag = "div", elevated = false, className, ...rest }: CardProps) {
  const cls = ["card", elevated && "card--elevated", className].filter(Boolean).join(" ");
  return <Tag className={cls} {...rest} />;
}
