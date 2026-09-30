import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  id, label, required, hint, error, children, className,
}: { id: string; label: string; required?: boolean; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[15px] font-semibold text-ink">
        {label}
        {required ? (
          <>
            <span className="text-alert" aria-hidden> *</span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : (
          <span className="font-normal text-ink-muted"> (opcional)</span>
        )}
      </label>
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, opts: { hint?: string; error?: string }) {
  return [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function RequiredLegend() {
  return (
    <p className="text-sm text-ink-muted">
      Los campos marcados con <span className="font-semibold text-alert" aria-hidden>*</span>
      <span className="sr-only">asterisco</span> son obligatorios.
    </p>
  );
}
