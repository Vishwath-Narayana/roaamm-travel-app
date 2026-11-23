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

// Signup, sign-in and account pages carry the passkey code: loaded on demand too.
const Signup = lazy(() => import("./pages/auth/Signup").then((m) => ({ default: m.Signup })));
const Login = lazy(() => import("./pages/auth/Login").then((m) => ({ default: m.Login })));
const Account = lazy(() => import("./pages/auth/Account").then((m) => ({ default: m.Account })));

const ROUTES: Record<string, ComponentType> = {
  "/": Landing,
  "/demo": Demo,
};

const LAZY_ROUTES: Record<string, ComponentType> = {
  "/signup": Signup,
  "/login": Login,
  "/account": Account,
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
  const LazyPage = LAZY_ROUTES[path];
  if (LazyPage) {
    return (
      <Shell>
        <Suspense fallback={null}>
          <LazyPage />
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
