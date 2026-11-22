import { lazy, Suspense, type ComponentType } from "react";
import { isRole } from "./api/session";
import { Shell } from "./layouts/Shell";
import { Demo } from "./pages/Demo";
import { Landing } from "./pages/Landing";
import { NotFound } from "./pages/NotFound";
import { useRoute, useRouteFocus } from "./router";

// Dashboards load on demand so the landing page bundle stays small.
const Dashboard = lazy(() =>
  import("./pages/app/Dashboard").then((m) => ({ default: m.Dashboard })),
);

const ROUTES: Record<string, ComponentType> = {
  "/": Landing,
  "/demo": Demo,
};

export function App() {
  const path = useRoute();
  useRouteFocus(path);
  const app = /^\/app\/([a-z]+)$/.exec(path);
  if (app && isRole(app[1])) {
    return (
      <Shell>
        <Suspense fallback={null}>
          <Dashboard key={app[1]} role={app[1]} />
        </Suspense>
      </Shell>
    );
  }
  const Page = ROUTES[path] ?? NotFound;
  return (
    <Shell>
      <Page />
    </Shell>
  );
}
