import type { ReactNode } from "react";
import { TopNav } from "../components/TopNav";
import { ToastProvider } from "../components/Toast";
import { Footer } from "./Footer";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopNav />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </ToastProvider>
  );
}
