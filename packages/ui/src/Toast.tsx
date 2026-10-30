import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import type { IconName } from "./Icon.js";
import { cx } from "./text.js";

type ToastTone = "success" | "danger" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

type ShowToast = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

const ICONS: Record<ToastTone, IconName> = {
  success: "checkCircle",
  danger: "alertCircle",
  info: "info",
};

const TOAST_MS = 4000;

/**
 * Short confirmations ("Link copied"). Announced through a polite live
 * region; anything the user must act on belongs in an inline `<Alert>`
 * instead, because toasts disappear.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback<ShowToast>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, tone, message }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fp-toasts" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={cx("fp-toast", `fp-toast--${item.tone}`)}>
            <Icon name={ICONS[item.tone]} size={18} className="fp-toast__icon" />
            <div className="fp-toast__message">{item.message}</div>
            <button type="button" className="fp-link-btn fp-xs" onClick={() => dismiss(item.id)}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Falls back to a no-op outside a provider so shared components never crash. */
export function useToast(): ShowToast {
  return useContext(ToastContext) ?? (() => undefined);
}
