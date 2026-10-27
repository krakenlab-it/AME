import { Search, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buildQuery } from "@/lib/admin/people-query";
import { PERSON_STATUSES, STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";
import { cn } from "@/lib/utils";

/** Búsqueda y filtro por estado de la tabla de personas. Todo viaja en la dirección de la página: se puede compartir y recargar. */
export function PeopleToolbar({
  q,
  status,
  orden,
  dir,
  counts,
  total,
}: {
  q: string;
  status: PersonStatus | undefined;
  orden: string | undefined;
  dir: string | undefined;
  counts: Record<PersonStatus, number>;
  total: number;
}) {
  const filtered = Boolean(q || status);
  const chipHref = (next: PersonStatus | undefined) => buildQuery({ estado: next, q, orden, dir });
  const chip = "inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors";
  return (
    <div className="space-y-3">
      <form role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <label className="sr-only" htmlFor="q">Buscar por nombre, cédula, pasaporte o código de confirmación</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar por nombre, cédula, pasaporte o AIG-…" className="field-input !min-h-[44px] !py-2 !pl-10 text-sm" />
        </div>
        {status && <input type="hidden" name="estado" value={status} />}
        {orden && <input type="hidden" name="orden" value={orden} />}
        {orden && dir && <input type="hidden" name="dir" value={dir} />}
        <Button type="submit" size="sm">Buscar</Button>
        {filtered && (
          <Link className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-semibold text-marian hover:bg-marian-soft" href="?">
            <X className="h-4 w-4" aria-hidden />Quitar filtros
          </Link>
        )}
      </form>
      <nav aria-label="Filtrar por estado">
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <li>
            <Link href={chipHref(undefined)} aria-current={!status ? "true" : undefined} className={cn(chip, !status ? "border-marian bg-marian text-white" : "border-marian-line bg-white text-ink hover:border-marian")}>
              Todos <span className="tabular-nums opacity-80">{total.toLocaleString("es-EC")}</span>
            </Link>
          </li>
          {PERSON_STATUSES.map((s) => (
            <li key={s}>
              <Link href={chipHref(s)} aria-current={status === s ? "true" : undefined} className={cn(chip, status === s ? "border-marian bg-marian text-white" : "border-marian-line bg-white text-ink hover:border-marian")}>
                {STATUS_LABELS[s]} <span className="tabular-nums opacity-80">{counts[s].toLocaleString("es-EC")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
