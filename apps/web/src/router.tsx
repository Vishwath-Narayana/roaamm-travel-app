import { withViewTransition } from "./viewTransition";
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";

// A tiny History API router: no library, three routes, back/forward support.

const NAVIGATE_EVENT = "roaamm:navigate";

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function getPath(): string {
  return normalize(window.location.pathname);
}

function getSearch(): string {
  return window.location.search;
}

/** Current query string parameters, re-rendered on every navigation. */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribe, getSearch, () => "");
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Current pathname (hash and query excluded), re-rendered on every navigation. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

/** Push a new history entry and re-render routed components. */
export function navigate(to: string, { replace = false } = {}): void {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  const target = url.pathname + url.search + url.hash;
  const samePage = normalize(url.pathname) === getPath();
  const go = () => {
    if (replace) window.history.replaceState(null, "", target);
    else window.history.pushState(null, "", target);
    window.dispatchEvent(new Event(NAVIGATE_EVENT));
  };
  // Cross-fade between pages where the browser supports View Transitions.
  if (samePage) go();
  else withViewTransition(go);
}

function isPlainLeftClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** An <a> that navigates in-page for same-origin paths and behaves normally otherwise. */
export function Link({ href, onClick, target, ...rest }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || !isPlainLeftClick(e) || (target && target !== "_self")) return;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return;
    // Same page, only the #hash differs: let the browser scroll natively.
    if (normalize(url.pathname) === getPath() && url.hash) return;
    e.preventDefault();
    navigate(href);
  }
  return <a href={href} target={target} onClick={handleClick} {...rest} />;
}

function focusWithoutScroll(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

/**
 * After a route change: scroll to the #hash target if there is one, otherwise
 * scroll to the top, and move focus to the page's h1 so screen readers announce
 * the new page. The first render is left alone apart from honouring a #hash.
 */
export function useRouteFocus(path: string): void {
  // Compare with the previous path (not a "first run" flag) so React StrictMode,
  // which runs effects twice in development, does not count as a navigation.
  const prev = useRef<string | null>(null);
  useEffect(() => {
    const isInitial = prev.current === null;
    const changed = prev.current !== null && prev.current !== path;
    prev.current = path;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? document.getElementById(hash) : null;
    if (isInitial) {
      target?.scrollIntoView?.();
      return;
    }
    if (!changed) return;
    if (target) {
      target.scrollIntoView?.();
      focusWithoutScroll(target);
      return;
    }
    // Instant: smooth scrolling is only for in-page anchor jumps.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const h1 = document.querySelector<HTMLElement>("main h1");
    if (h1) {
      focusWithoutScroll(h1);
      return;
    }
    // A lazy page renders its h1 a moment later: focus it when it appears.
    const main = document.querySelector("main");
    if (!main) return;
    const observer = new MutationObserver(() => {
      const late = main.querySelector<HTMLElement>("h1");
      if (late) {
        observer.disconnect();
        focusWithoutScroll(late);
      }
    });
    observer.observe(main, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, [path]);
}

const SITE = "https://roaamm.plinthwell.com";

/**
 * Sets document.title for the current page, and points the canonical link
 * and og:url at this page (index.html starts with the home page's values).
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title === "ROAAMM" ? title : `${title} · ROAAMM`;
    const url = SITE + normalize(window.location.pathname);
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
  }, [title]);
}
