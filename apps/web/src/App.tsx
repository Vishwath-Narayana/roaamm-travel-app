import type { ComponentType } from "react";
import { Shell } from "./layouts/Shell";
import { Demo } from "./pages/Demo";
import { Landing } from "./pages/Landing";
import { NotFound } from "./pages/NotFound";
import { useRoute, useRouteFocus } from "./router";

const ROUTES: Record<string, ComponentType> = {
  "/": Landing,
  "/demo": Demo,
};

export function App() {
  const path = useRoute();
  useRouteFocus(path);
  const Page = ROUTES[path] ?? NotFound;
  return (
    <Shell>
      <Page />
    </Shell>
  );
}
