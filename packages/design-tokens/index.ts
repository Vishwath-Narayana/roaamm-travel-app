// Monochrome tokens. Black ink is the accent. SOS is the only red and is always solid.
export const tokens = {
  color: {
    ink: "#0b0b0c",
    paper: "#fafafa",
    muted: "#5c5c61",
    line: "#d9d9dd",
    sos: "#d92d20",
  },
  radius: { sm: "6px", md: "12px", lg: "20px" },
  motion: { spring: { type: "spring", stiffness: 380, damping: 32 } },
} as const;
