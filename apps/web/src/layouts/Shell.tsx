import type { ReactNode } from "react";
import { ScrollProgress } from "../components/ScrollProgress";
import { TopNav } from "../components/TopNav";
import { ToastProvider } from "../components/Toast";
import { Footer } from "./Footer";
import { useRoute } from "../router";

export function Shell({ children }: { children: ReactNode }) {
  const path = useRoute();
  return (
    <ToastProvider>
      <ScrollProgress />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopNav overlay={path === "/"} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </ToastProvider>
  );
}
