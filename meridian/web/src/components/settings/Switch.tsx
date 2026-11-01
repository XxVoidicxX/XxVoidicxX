import { cn } from "@/components/ui";

export function Switch({ checked, onChange, disabled, label, loading }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; loading?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-ink-300",
        loading && "animate-pulse"
      )}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}
