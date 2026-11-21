import {
  useEffect,
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
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
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
  const first = useRef(true);
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? document.getElementById(hash) : null;
    if (first.current) {
      first.current = false;
      target?.scrollIntoView?.();
      return;
    }
    if (target) {
      target.scrollIntoView?.();
      focusWithoutScroll(target);
      return;
    }
    window.scrollTo(0, 0);
    const h1 = document.querySelector<HTMLElement>("main h1");
    if (h1) focusWithoutScroll(h1);
  }, [path]);
}

/** Sets document.title for the current page. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title === "ROAAMM" ? title : `${title} · ROAAMM`;
  }, [title]);
}
