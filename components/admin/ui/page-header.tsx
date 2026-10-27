import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Cabecera común de todas las páginas del panel: un solo título (h1), una frase que lo explica y las acciones principales. */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="space-y-3">
      {back && (
        <nav aria-label="Ruta de navegación">
          <Link href={back.href} className="-ml-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-marian hover:bg-marian-soft">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </Link>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="page-title">{title}</h1>
            {badge}
          </div>
          {description && <p className="page-lead">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Contenedor de página. `narrow` para formularios y textos largos; `default` para tablas. */
export function AdminPage({ children, width = "default", className }: { children: ReactNode; width?: "narrow" | "medium" | "default"; className?: string }) {
  return <div className={cn("admin-page", width === "narrow" && "max-w-2xl", width === "medium" && "max-w-4xl", className)}>{children}</div>;
}
