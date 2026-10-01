import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
  textAlign = "default",
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  /** Landing cédula panel: centered labels, helpers, and errors. */
  textAlign?: "default" | "landing";
}) {
  const landing = textAlign === "landing";
  const labelClass = landing ? "text-center text-pretty" : "";
  const hintClass = landing ? "text-center text-pretty" : "";
  const errorClass = landing ? "justify-center text-center" : "items-start";

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className={cn("block text-[15px] font-semibold text-ink", labelClass)}>
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
      {hint && <p id={`${id}-hint`} className={cn("text-sm text-ink-muted", hintClass)}>{hint}</p>}
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className={cn("flex gap-1.5 text-sm font-medium text-alert", errorClass)}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className={landing ? "text-pretty" : undefined}>{error}</span>
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
