import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initMotionPreference } from "./motion/preference";
import { installTilt } from "./motion/tilt";
import { initTheme } from "./theme";
import "./styles.css";

// Apply a saved light/dark choice before the first render.
initTheme();
initMotionPreference();
installTilt();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
