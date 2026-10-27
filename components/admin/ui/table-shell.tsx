import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Marco de toda tabla del panel: borde, scroll propio y encabezado fijo. */
export function TableShell({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-marian-line/70 bg-white", className)}>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={label}>{children}</div>
    </div>
  );
}
