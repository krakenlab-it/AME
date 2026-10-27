import { History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/admin/ui/empty-state";
import { AdminPage, PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { SectionCard } from "@/components/admin/ui/section-card";
import { TableShell } from "@/components/admin/ui/table-shell";
import { Button } from "@/components/ui/button";
import { actorLabel, AUDIT_ACTIONS, auditLabel, AUDIT_LABELS, isAuditAction } from "@/lib/admin/labels";
import { buildQuery, parsePageParam, totalPages } from "@/lib/admin/people-query";
import { getRepo } from "@/lib/database";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 50;
export const metadata = { title: "Auditoría" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ accion?: string; p?: string }> }) {
  await requireAdmin("audit:view");
  const sp = await searchParams;
  const action = isAuditAction(sp.accion) ? sp.accion : undefined;
  const requestedPage = parsePageParam(sp.p);
  const repo = getRepo();
  const [{ rows, total }, security] = await Promise.all([repo.listAudit({ page: requestedPage, pageSize: PAGE_SIZE, action }), repo.recentSecurityEvents(30)]);
  const pages = totalPages(total, PAGE_SIZE);
  const page = Math.min(requestedPage, pages);

  return (
    <AdminPage>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo. Aquí no se guardan datos personales, solo los nombres de los campos que cambiaron."
      />

      <section aria-label="Eventos de auditoría" className="space-y-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <label htmlFor="accion" className="sr-only">Filtrar por evento</label>
          <select id="accion" name="accion" defaultValue={action ?? ""} className="field-input !min-h-[44px] w-full !py-2 text-sm sm:w-80">
            <option value="">Todos los eventos</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_LABELS[a]}</option>)}
          </select>
          <Button type="submit" size="sm">Filtrar</Button>
          {action && <Link href="?" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-marian hover:bg-marian-soft">Quitar filtro</Link>}
        </form>

        <TableShell label="Eventos de auditoría">
          <table className="admin-table">
            <caption className="sr-only">Eventos de auditoría</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Evento</th>
                <th scope="col" className="max-md:hidden">Quién</th>
                <th scope="col">Registro</th>
                <th scope="col" className="max-lg:hidden">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td>
                    <span className="font-medium">{auditLabel(r.action)}</span>
                    <span className="block text-xs text-ink-muted">{r.action}</span>
                    <span className="block text-xs text-ink-muted md:hidden">{actorLabel(r.actor_type)}</span>
                  </td>
                  <td className="max-md:hidden">{actorLabel(r.actor_type)}</td>
                  <td>
                    {r.person_id ? (
                      <Link className="inline-flex min-h-[44px] items-center font-semibold text-marian underline-offset-2 hover:underline" href={`/admin/personas/${r.person_id}`}>Ver ficha</Link>
                    ) : "—"}
                  </td>
                  <td className="max-w-md break-words text-xs text-ink-muted max-lg:hidden">{[r.changed_fields.join(", "), Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <EmptyState icon={History} title={action ? "No hay eventos de este tipo" : "Todavía no hay eventos"}>
              {action ? "Prueba con otro tipo de evento o quita el filtro." : "Cuando alguien use el panel, aquí quedará el registro."}
            </EmptyState>
          )}
        </TableShell>

        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={PAGE_SIZE}
          noun="evento"
          nounPlural="eventos"
          href={(p) => buildQuery({ accion: action, p: p > 1 ? p : undefined })}
        />
      </section>

      <SectionCard id="seguridad" title="Eventos de seguridad recientes" description="Intentos con enlaces inexistentes, límites de velocidad y bloqueos. Las IP se guardan solo como hash.">
        <TableShell label="Eventos de seguridad recientes">
          <table className="admin-table">
            <caption className="sr-only">Eventos de seguridad recientes</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th></tr></thead>
            <tbody>{security.map((s, i) => <tr key={i}><td className="whitespace-nowrap">{formatDateTime(s.created_at)}</td><td>{s.event_type}</td></tr>)}</tbody>
          </table>
          {security.length === 0 && <EmptyState icon={ShieldCheck} title="Sin eventos de seguridad recientes">Es buena señal: nadie ha intentado nada raro.</EmptyState>}
        </TableShell>
      </SectionCard>
    </AdminPage>
  );
}
