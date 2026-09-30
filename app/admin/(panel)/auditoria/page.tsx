import Link from "next/link";
import { actorLabel, AUDIT_ACTIONS, auditLabel, AUDIT_LABELS, isAuditAction } from "@/lib/admin/labels";
import { Button } from "@/components/ui/button";
import { getRepo } from "@/lib/database";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 50;
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ accion?: string; p?: string }> }) {
  await requireAdmin("audit:view");
  const sp = await searchParams;
  const action = isAuditAction(sp.accion) ? sp.accion : undefined;
  const page = Math.max(1, Number(sp.p) || 1);
  const repo = getRepo();
  const [{ rows, total }, security] = await Promise.all([repo.listAudit({ page, pageSize: PAGE_SIZE, action }), repo.recentSecurityEvents(30)]);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl">Auditoría</h1>
        <p className="text-ink-muted">Quién hizo qué y cuándo. Aquí no se guardan datos personales, solo los nombres de los campos que cambiaron.</p>
      </header>
      <form className="flex flex-wrap gap-2" role="search">
        <label htmlFor="accion" className="sr-only">Filtrar por evento</label>
        <select id="accion" name="accion" defaultValue={action ?? ""} className="field-input !min-h-[44px] w-full !py-2 text-sm sm:w-80">
          <option value="">Todos los eventos</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_LABELS[a]}</option>)}
        </select>
        <Button type="submit" size="sm">Filtrar</Button>
      </form>
      <div className="sheet overflow-x-auto">
        <table className="admin-table">
          <caption className="sr-only">Eventos de auditoría</caption>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Quién</th><th scope="col">Registro</th><th scope="col">Detalle</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
              <td><span className="font-medium">{auditLabel(r.action)}</span><span className="block text-xs text-ink-muted">{r.action}</span></td>
              <td>{actorLabel(r.actor_type)}</td>
              <td>{r.person_id ? <Link className="font-semibold text-marian underline-offset-2 hover:underline" href={`/admin/personas/${r.person_id}`}>Ver ficha</Link> : "—"}</td>
              <td className="max-w-md break-words text-xs text-ink-muted">{[r.changed_fields.join(", "), Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-ink-muted" aria-live="polite">{total.toLocaleString("es-EC")} eventos · página {page}</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold text-marian hover:bg-marian-soft" href={`?${new URLSearchParams({ ...(action ? { accion: action } : {}), p: String(page - 1) })}`}>← Anterior</Link>}
          {page * PAGE_SIZE < total && <Link className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold text-marian hover:bg-marian-soft" href={`?${new URLSearchParams({ ...(action ? { accion: action } : {}), p: String(page + 1) })}`}>Siguiente →</Link>}
        </div>
      </nav>

      <section className="space-y-3">
        <h2 className="text-2xl">Eventos de seguridad recientes</h2>
        <p className="text-sm text-ink-muted">Intentos con enlaces inexistentes, límites de velocidad y bloqueos. Las IP se guardan solo como hash.</p>
        <div className="sheet overflow-x-auto">
          <table className="admin-table">
            <caption className="sr-only">Eventos de seguridad recientes</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th></tr></thead>
            <tbody>{security.map((s, i) => <tr key={i}><td>{formatDateTime(s.created_at)}</td><td>{s.event_type}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
