import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prefersReducedMotion } from "../motion";
import { DUR, EXIT_RATIO, springEasing } from "../motion/tokens";
import { CloseIcon } from "./icons";
import "./Toast.css";

type ToastItem = { id: number; message: string; duration: number; leaving?: boolean };

/** How long a toast takes to leave (exits are shorter than entrances). */
export const TOAST_EXIT_MS = Math.round(DUR.content * EXIT_RATIO);
type ToastApi = { show: (message: string, opts?: { duration?: number }) => void };

const ToastContext = createContext<ToastApi | null>(null);

export const DEFAULT_TOAST_MS = 5000;

/** Renders a polite live region and exposes `useToast().show(...)` to children. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const tops = useRef(new Map<number, number>());

  // Leaving toasts play their exit, then are removed; under reduced motion at once.
  const dismiss = useCallback((id: number) => {
    if (prefersReducedMotion()) {
      setToasts((all) => all.filter((t) => t.id !== id));
      return;
    }
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), TOAST_EXIT_MS);
  }, []);

  // FLIP: when the stack changes, slide each toast from where it was to where
  // it now is (transform only), instead of letting it jump.
  useLayoutEffect(() => {
    const next = new Map<number, number>();
    for (const [id, el] of nodes.current) {
      const top = el.getBoundingClientRect().top;
      next.set(id, top);
      const before = tops.current.get(id);
      if (before !== undefined && before !== top && !prefersReducedMotion() && el.animate) {
        el.animate([{ translate: `0 ${before - top}px` }, { translate: "0 0" }], {
          duration: DUR.ui,
          easing: springEasing(),
        });
      }
    }
    tops.current = next;
  }, [toasts]);

  const show = useCallback<ToastApi["show"]>((message, opts) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { id, message, duration: opts?.duration ?? DEFAULT_TOAST_MS }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <Toast
            key={t.id}
            item={t}
            onDismiss={dismiss}
            nodeRef={(el) => {
              if (el) nodes.current.set(t.id, el);
              else nodes.current.delete(t.id);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({
  item,
  onDismiss,
  nodeRef,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
  nodeRef: (el: HTMLDivElement | null) => void;
}) {
  useEffect(() => {
    if (item.leaving) return;
    const timer = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item, onDismiss]);

  return (
    <div
      ref={nodeRef}
      className={`toast${item.leaving ? " toast--leaving" : ""}`}
      aria-hidden={item.leaving || undefined}
    >
      <p className="toast__message">{item.message}</p>
      <button
        type="button"
        className="toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Like useToast, but returns null outside a provider (for reusable demos). */
export function useOptionalToast(): ToastApi | null {
  return useContext(ToastContext);
}
