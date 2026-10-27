import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Tarjeta con título, texto de apoyo y acciones. Reemplaza los bloques sueltos `sheet + h2`. */
export function SectionCard({
  id,
  title,
  description,
  actions,
  tone = "default",
  children,
  className,
  ariaLabel,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "default" | "danger";
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const titleId = id && title ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      aria-label={titleId ? undefined : ariaLabel}
      className={cn("admin-card scroll-mt-24 space-y-4", tone === "danger" && "border-alert/40", className)}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && <h2 id={titleId} className="section-title">{title}</h2>}
            {description && <div className="section-lead">{description}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
