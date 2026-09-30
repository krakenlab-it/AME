import Link from "next/link";
import { getRepo } from "@/lib/database";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 50;
const ACTIONS = [
  "RECORD_OPENED", "IDENTITY_VERIFIED", "IDENTITY_FAILED", "DATA_UPDATED", "NAMES_CORRECTED", "CONSENT_ACCEPTED", "FORM_SUBMITTED",
  "ADMIN_VIEWED", "ADMIN_LOGIN", "ADMIN_LOGIN_FAILED", "EXPORT_CREATED", "IMPORT_CREATED", "LINK_CREATED", "LINK_REVOKED",
  "RECORD_REVIEWED", "NOTICE_PUBLISHED", "RETENTION_APPLIED",
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ accion?: string; p?: string }> }) {
  await requireAdmin("audit:view");
  const sp = await searchParams;
  const action = ACTIONS.includes(sp.accion ?? "") ? sp.accion : undefined;
  const page = Math.max(1, Number(sp.p) || 1);
  const repo = getRepo();
  const [{ rows, total }, security] = await Promise.all([repo.listAudit({ page, pageSize: PAGE_SIZE, action }), repo.recentSecurityEvents(30)]);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl">Auditoría</h1>
      <form className="flex gap-2">
        <label htmlFor="accion" className="sr-only">Evento</label>
        <select id="accion" name="accion" defaultValue={action ?? ""} className="field-input !min-h-[44px] w-72 !py-2 text-sm">
          <option value="">Todos los eventos</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="rounded-xl bg-marian px-4 text-sm font-semibold text-white" type="submit">Filtrar</button>
      </form>
      <div className="sheet overflow-x-auto">
        <table className="admin-table">
          <thead><tr><th>Fecha</th><th>Evento</th><th>Actor</th><th>Registro</th><th>Detalle</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
              <td className="font-medium">{r.action}</td>
              <td>{r.actor_type}</td>
              <td>{r.person_id ? <Link className="text-marian hover:underline" href={`/admin/personas/${r.person_id}`}>Ver</Link> : "—"}</td>
              <td className="max-w-md text-xs text-ink-muted">{[r.changed_fields.join(", "), Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-muted">{total} eventos</span>
        <div className="flex gap-2">
          {page > 1 && <Link className="text-marian" href={`?${new URLSearchParams({ ...(action ? { accion: action } : {}), p: String(page - 1) })}`}>Anterior</Link>}
          {page * PAGE_SIZE < total && <Link className="text-marian" href={`?${new URLSearchParams({ ...(action ? { accion: action } : {}), p: String(page + 1) })}`}>Siguiente</Link>}
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl">Eventos de seguridad recientes</h2>
        <p className="text-sm text-ink-muted">Intentos con enlaces inexistentes, límites de velocidad y bloqueos. Las IP se guardan solo como hash.</p>
        <div className="sheet overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Evento</th></tr></thead>
            <tbody>{security.map((s, i) => <tr key={i}><td>{formatDateTime(s.created_at)}</td><td>{s.event_type}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
