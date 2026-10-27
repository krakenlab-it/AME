import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { pageWindow } from "@/lib/admin/people-query";
import { cn } from "@/lib/utils";

const cell = "inline-flex h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors";

/** Paginación por enlaces: funciona sin JavaScript y conserva los filtros que arma `href`. */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  noun,
  nounPlural,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  noun: string;
  nounPlural: string;
  href: (page: number) => string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <p aria-live="polite">
        {total === 0 ? `0 ${nounPlural}` : `Mostrando ${first.toLocaleString("es-EC")}–${last.toLocaleString("es-EC")} de ${total.toLocaleString("es-EC")} ${total === 1 ? noun : nounPlural}`}
        <span className="hidden sm:inline"> · página {page} de {pages}</span>
      </p>
      {pages > 1 && (
        <ul className="flex items-center gap-1">
          {page > 1 && (
            <li>
              <Link href={href(page - 1)} rel="prev" className={cn(cell, "text-marian hover:bg-marian-soft")}>
                <ChevronLeft className="h-4 w-4" aria-hidden /><span className="ml-1 hidden sm:inline">Anterior</span><span className="sr-only sm:hidden">Anterior</span>
              </Link>
            </li>
          )}
          {pageWindow(page, pages).map((n, i) => (
            <li key={n ?? `gap-${i}`} className={cn(n !== null && n !== page && "hidden sm:block")}>
              {n === null ? (
                <span aria-hidden className="px-1">…</span>
              ) : n === page ? (
                <span aria-current="page" className={cn(cell, "bg-marian text-white")}>{n}</span>
              ) : (
                <Link href={href(n)} aria-label={`Ir a la página ${n}`} className={cn(cell, "text-marian hover:bg-marian-soft")}>{n}</Link>
              )}
            </li>
          ))}
          {page < pages && (
            <li>
              <Link href={href(page + 1)} rel="next" className={cn(cell, "text-marian hover:bg-marian-soft")}>
                <span className="mr-1 hidden sm:inline">Siguiente</span><span className="sr-only sm:hidden">Siguiente</span><ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </li>
          )}
        </ul>
      )}
    </nav>
  );
}
