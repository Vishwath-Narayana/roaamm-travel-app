import {
  createElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import { MOTION_EVENT, isMotionReducedBySite } from "./preference";

// Small motion helpers. No animation library: CSS does the animating, these
// hooks only decide *when*. Everything respects prefers-reduced-motion.

const REDUCE = "(prefers-reduced-motion: reduce)";

function reduceQuery(): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(REDUCE) : null;
}

/** True if the OS asks for reduced motion. */
export function systemPrefersReducedMotion(): boolean {
  return reduceQuery()?.matches ?? false;
}

/** True if motion should be reduced: the OS setting or the site's footer switch. */
export function prefersReducedMotion(): boolean {
  return systemPrefersReducedMotion() || isMotionReducedBySite();
}

function subscribeReduce(cb: () => void) {
  const mq = reduceQuery();
  mq?.addEventListener("change", cb);
  window.addEventListener(MOTION_EVENT, cb);
  return () => {
    mq?.removeEventListener("change", cb);
    window.removeEventListener(MOTION_EVENT, cb);
  };
}

/** True while motion should be reduced (OS setting or footer switch); updates live. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, prefersReducedMotion, () => false);
}

/** True while the OS asks for reduced motion; updates live. */
export function useSystemPrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduce, systemPrefersReducedMotion, () => false);
}

// One IntersectionObserver per rootMargin, shared by every element using it.
type Callback = (entry: IntersectionObserverEntry) => void;
const observers = new Map<string, { io: IntersectionObserver; callbacks: Map<Element, Callback> }>();

function observe(el: Element, margin: string, cb: Callback): () => void {
  let entry = observers.get(margin);
  if (!entry) {
    const callbacks = new Map<Element, Callback>();
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => callbacks.get(e.target)?.(e)),
      { rootMargin: margin },
    );
    entry = { io, callbacks };
    observers.set(margin, entry);
  }
  entry.callbacks.set(el, cb);
  entry.io.observe(el);
  const current = entry;
  return () => {
    current.callbacks.delete(el);
    current.io.unobserve(el);
  };
}

export const canObserve = () => typeof IntersectionObserver !== "undefined";

/**
 * Whether `ref` is on screen (within `margin`). With `once`, it stays true
 * after the first time. Without IntersectionObserver it reports true.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { margin = "0px", once = false }: { margin?: string; once?: boolean } = {},
): boolean {
  const [inView, setInView] = useState(() => !canObserve());
  useEffect(() => {
    const el = ref.current;
    if (!el || !canObserve()) return;
    const stop = observe(el, margin, (e) => {
      setInView(e.isIntersecting);
      if (e.isIntersecting && once) stop();
    });
    return stop;
  }, [ref, margin, once]);
  return inView;
}

/**
 * Reveal-on-scroll for any element: returns a ref and whether it has been
 * revealed. Revealed immediately under reduced motion or without
 * IntersectionObserver, so the final state always shows.
 */
export function useReveal<T extends Element>(margin = "0px 0px -8% 0px") {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(() => !canObserve() || prefersReducedMotion());
  useEffect(() => {
    const el = ref.current;
    if (shown || !el) return;
    const stop = observe(el, margin, (e) => {
      if (e.isIntersecting) {
        setShown(true);
        stop();
      }
    });
    return stop;
  }, [shown, margin]);
  return [ref, shown] as const;
}

export type RevealVariant =
  | "fade-up"
  | "fade"
  | "scale"
  | "line"
  | "mask-line"
  | "slide-left"
  | "slide-right"
  | "blur-in";

type RevealProps = HTMLAttributes<HTMLElement> & {
  /** Element to render (keeps list semantics: use "li" inside lists). */
  as?: "div" | "li" | "section" | "header" | "span" | "p" | "h2" | "h3" | "dl" | "ol" | "ul";
  variant?: RevealVariant;
  /** Stagger index: delays the animation by `delay` x 80 ms (CSS variable --i). */
  delay?: number;
  children?: ReactNode;
};

/**
 * Fades its content in (24px, 500ms by default) the first time it scrolls
 * into view. See .reveal in styles/motion.css.
 */
export function Reveal({
  as = "div",
  variant = "fade-up",
  delay = 0,
  className,
  style,
  children,
  ...rest
}: RevealProps) {
  const [ref, shown] = useReveal<HTMLElement>();
  // "is-revealing" (and with it will-change) lasts only while the reveal runs.
  const [running, setRunning] = useState(false);
  const wasShown = useRef(shown);
  useEffect(() => {
    if (shown && !wasShown.current) setRunning(true);
    wasShown.current = shown;
  }, [shown]);
  return createElement(
    as,
    {
      ...rest,
      ref,
      onTransitionEnd: (e: React.TransitionEvent<HTMLElement>) => {
        if (e.target === e.currentTarget) setRunning(false);
        rest.onTransitionEnd?.(e);
      },
      className: ["reveal", `reveal--${variant}`, shown && "is-visible", running && "is-revealing", className]
        .filter(Boolean)
        .join(" "),
      style: { ...style, "--i": delay } as CSSProperties,
      "data-reveal": shown ? "shown" : "hidden",
    },
    // mask-line: a static mask on the element, and an inner wrapper that rises
    // through it (translate and opacity only, so it stays on the compositor).
    variant === "mask-line" ? createElement("span", { className: "mask-line__inner" }, children) : children,
  );
}
