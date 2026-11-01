import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: 'success' | 'info' | 'warning' | 'danger';
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.duration ?? (t.action ? 7000 : 4000));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
          {items.map((t) => {
            const Icon = t.tone === 'warning' || t.tone === 'danger' ? AlertTriangle : t.tone === 'info' ? Info : CheckCircle2;
            return (
              <div key={t.id} className={`toast toast-${t.tone ?? 'success'}`} role="status">
                <Icon size={18} className="toast-icon" aria-hidden />
                <div className="toast-text">
                  <p className="toast-title">{t.title}</p>
                  {t.description && <p className="toast-desc">{t.description}</p>}
                </div>
                {t.action && (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
