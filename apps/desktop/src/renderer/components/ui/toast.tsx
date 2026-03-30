import { type ComponentType } from "react";
import { useToastStore } from "../../hooks/useToast";
import { cn } from "../../lib/utils";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

const variantStyles: Record<string, string> = {
  default: "border-l-[var(--border)]",
  success: "border-l-[var(--success)]",
  error: "border-l-[var(--destructive)]",
  warning: "border-l-[var(--warning)]",
};

const variantIcons: Record<string, ComponentType<{ className?: string }>> = {
  default: Info,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
};

function ToastItem({ id, message, variant }: { id: string; message: string; variant: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const Icon = variantIcons[variant] || Info;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 shadow-lg",
        "border-l-[3px] text-[13px]",
        "animate-slide-in",
        variantStyles[variant],
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
      <span className="flex-1 text-[var(--card-foreground)]">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </div>
  );
}
