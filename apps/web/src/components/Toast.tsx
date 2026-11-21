import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CloseIcon } from "./icons";
import "./Toast.css";

type ToastItem = { id: number; message: string; duration: number };
type ToastApi = { show: (message: string, opts?: { duration?: number }) => void };

const ToastContext = createContext<ToastApi | null>(null);

export const DEFAULT_TOAST_MS = 5000;

/** Renders a polite live region and exposes `useToast().show(...)` to children. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

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
          <Toast key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item, onDismiss]);

  return (
    <div className="toast">
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
