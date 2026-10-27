import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, SearchX } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { TableShell } from "@/components/admin/ui/table-shell";
import { buildQuery, nextSort, sortParamFor } from "@/lib/admin/people-query";
import type { PeopleSort, PeopleSortField, PersonListRow } from "@/lib/database/types";
import { maskCedulaTail } from "@/lib/security/masking";
import type { PersonStatus } from "@/lib/validation/constants";
import { formatDateTime } from "@/lib/utils";

interface FilterState {
  q: string;
  status: PersonStatus | undefined;
  sort: PeopleSort | undefined;
}

function sortHref(filters: FilterState, field: PeopleSortField): string {
  const next = nextSort(filters.sort, field);
  return buildQuery({ estado: filters.status, q: filters.q, orden: sortParamFor(field), dir: next.dir });
}

function SortHeader({ field, label, filters, className }: { field: PeopleSortField; label: string; filters: FilterState; className?: string }) {
  const active = filters.sort?.by === field ? filters.sort.dir : undefined;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined} className={className}>
      <Link href={sortHref(filters, field)} className="-mx-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 hover:bg-marian-soft hover:text-marian">
        {label}
        <Icon className={active ? "h-3.5 w-3.5 text-marian" : "h-3.5 w-3.5 opacity-50"} aria-hidden />
        <span className="sr-only">{active === "asc" ? ": orden ascendente, tocar para invertir" : active === "desc" ? ": orden descendente, tocar para invertir" : ": tocar para ordenar"}</span>
      </Link>
    </th>
  );
}

/** Tabla de personas. La cédula siempre sale enmascarada; en teléfono se esconden las columnas secundarias y la fila se resume. */
export function PeopleTable({ rows, filters }: { rows: PersonListRow[]; filters: FilterState }) {
  const filtered = Boolean(filters.q || filters.status);
  return (
    <TableShell label="Tabla de personas invitadas">
      <table className="admin-table">
        <caption className="sr-only">Personas invitadas y su estado</caption>
        <thead>
          <tr>
            <SortHeader field="last_names" label="Apellidos" filters={filters} />
            <SortHeader field="first_names" label="Nombres" filters={filters} className="max-md:hidden" />
            <th scope="col" className="max-md:hidden">Documento</th>
            <th scope="col">Estado</th>
            <th scope="col" className="max-lg:hidden">Confirmación</th>
            <SortHeader field="submitted_at" label="Enviado" filters={filters} className="max-lg:hidden" />
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="text-left font-medium">
                {r.last_names}
                <span className="block text-[13px] font-normal text-ink-muted md:hidden">{r.first_names} · <span className="tabular-nums">{maskCedulaTail(r.national_id_last2)}</span></span>
              </th>
              <td className="max-md:hidden">{r.first_names}</td>
              <td className="tabular-nums max-md:hidden">{maskCedulaTail(r.national_id_last2)}</td>
              <td><StatusBadge status={r.status} /></td>
              <td className="whitespace-nowrap tabular-nums max-lg:hidden">{r.confirmation_code ?? "—"}</td>
              <td className="whitespace-nowrap max-lg:hidden">{formatDateTime(r.submitted_at)}</td>
              <td className="text-right">
                <Link className="inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-lg px-2 font-semibold text-marian hover:bg-marian-soft" href={`/admin/personas/${r.id}`}>
                  <span className="max-md:sr-only">Ver ficha</span>
                  <span className="sr-only"> de {r.first_names} {r.last_names}</span>
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={filtered ? "No encontramos registros con estos filtros" : "Todavía no hay personas cargadas"}
          action={filtered
            ? <Link className="inline-flex min-h-[44px] items-center rounded-xl border border-marian/40 px-4 font-semibold text-marian hover:bg-marian-soft/60" href="?">Quitar los filtros</Link>
            : undefined}
        >
          {filtered ? "Prueba con otro nombre, revisa que la cédula tenga todos sus dígitos o cambia el estado." : "Cuando importes el archivo inicial, las personas aparecerán aquí."}
        </EmptyState>
      )}
    </TableShell>
  );
}
