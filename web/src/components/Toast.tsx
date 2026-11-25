import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastKind = "ok" | "error" | "info";
type Toast = { id: number; kind: ToastKind; title: string; detail?: string };
type Push = (kind: ToastKind, title: string, detail?: string) => void;

const ToastContext = createContext<Push>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback<Push>((kind, title, detail) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, kind, title, detail }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <div className="toast-body">
              <strong>{t.title}</strong>
              {t.detail ? <span>{t.detail}</span> : null}
            </div>
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
