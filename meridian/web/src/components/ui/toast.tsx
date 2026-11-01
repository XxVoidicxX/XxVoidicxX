import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import clsx from "clsx";

type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; title: string; body?: string }
const Ctx = createContext<{ toast: (kind: ToastKind, title: string, body?: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = idRef.current++;
    setItems((x) => [...x, { id, kind, title, body }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-3 shadow-pop animate-fade-in">
            {t.kind === "success" ? <CheckCircle2 className="h-5 w-5 text-success-600 shrink-0" /> : t.kind === "error" ? <AlertCircle className="h-5 w-5 text-danger-600 shrink-0" /> : <Info className="h-5 w-5 text-brand-600 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className={clsx("text-sm font-medium", t.kind === "error" ? "text-danger-700" : "text-ink-900")}>{t.title}</p>
              {t.body && <p className="text-xs text-ink-500 mt-0.5 break-words">{t.body}</p>}
            </div>
            <button onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} className="text-ink-400 hover:text-ink-700" aria-label="Dismiss"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast outside ToastProvider");
  return c;
}
