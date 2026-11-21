import type { SVGProps } from "react";

// Small inline icons. Decorative by default (aria-hidden); 24px grid, 1.75 stroke.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const GuideIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="7.5" r="3.5" />
    <path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6" />
    <path d="M17.5 3.5l1 1 2-2" />
  </Icon>
);

export const PriceIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9-8-8z" />
    <circle cx="8.5" cy="8.5" r="1.5" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" />
    <path d="M9 12l2 2 4-4" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

/** The ROAAMM mark: a route line between two stops inside a compass ring. */
export const MarkIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M8 16c1.5-5 6.5-3 8-8" />
    <circle cx="8" cy="16" r="1.25" fill="currentColor" />
    <circle cx="16" cy="8" r="1.25" fill="currentColor" />
  </Icon>
);
