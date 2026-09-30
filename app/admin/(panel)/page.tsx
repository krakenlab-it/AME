import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { Notice } from "@/components/ui/notice";
import { getRepo } from "@/lib/database";
import { keyedHash } from "@/lib/encryption/crypto";
import { isValidCedula } from "@/lib/validation/cedula";
import { PERSON_STATUSES, STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";
import { maskCedulaTail } from "@/lib/security/masking";
import { can } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 25;

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; p?: string; denegado?: string }> }) {
  const { admin } = await requireAdmin("dashboard:view");
  const sp = await searchParams;
  const repo = getRepo();
  const counts = await repo.statusCounts();
  const invited = Object.values(counts).reduce((a, b) => a + b, 0);

  const cards: [string, number, PersonStatus | null][] = [
    ["Invitados", invited, null],
    ["Pendientes", counts.PENDING, "PENDING"],
    ["Iniciados", counts.STARTED, "STARTED"],
    ["Completados", counts.COMPLETED, "COMPLETED"],
    ["Requieren revisión", counts.NEEDS_REVIEW, "NEEDS_REVIEW"],
  ];

  const canView = can(admin.role, "people:view");
  const status = PERSON_STATUSES.includes(sp.estado as PersonStatus) ? (sp.estado as PersonStatus) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number(sp.p) || 1);
  const list = canView
    ? await repo.listPeople({
        status,
        page,
        pageSize: PAGE_SIZE,
        ...(isValidCedula(q) ? { nationalIdHash: keyedHash(q, "national_id") } : { search: q || undefined }),
      })
    : null;

  const qs = (extra: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { estado: status, q: q || undefined, p: page, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "") params.set(k, String(v));
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-8">
      {sp.denegado && <Notice tone="warning">Tu rol no tiene permiso para esa sección.</Notice>}
      <h1 className="text-3xl">Resumen</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map(([label, value, s]) => (
          <Link key={label} href={canView ? (s ? `?estado=${s}` : "?") : "#"} className="sheet block p-4 hover:border-marian">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-marian">{value.toLocaleString("es-EC")}</p>
          </Link>
        ))}
      </div>

      {list && (
        <section className="space-y-4" aria-labelledby="personas">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="personas" className="text-2xl">Registros</h2>
            <form className="flex flex-wrap gap-2" role="search">
              <label className="sr-only" htmlFor="q">Buscar</label>
              <input id="q" name="q" defaultValue={q} placeholder="Nombre, apellido, cédula o AIG-…" className="field-input !min-h-[44px] w-72 !py-2 text-sm" />
              <label className="sr-only" htmlFor="estado">Estado</label>
              <select id="estado" name="estado" defaultValue={status ?? ""} className="field-input !min-h-[44px] w-48 !py-2 text-sm">
                <option value="">Todos los estados</option>
                {PERSON_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button className="rounded-xl bg-marian px-4 text-sm font-semibold text-white" type="submit">Filtrar</button>
            </form>
          </div>
          <div className="sheet overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr><th>Apellidos</th><th>Nombres</th><th>Cédula</th><th>Estado</th><th>Confirmación</th><th>Enviado</th><th><span className="sr-only">Acciones</span></th></tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.last_names}</td>
                    <td>{r.first_names}</td>
                    <td className="tabular-nums">{maskCedulaTail(r.national_id_last2)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="tabular-nums">{r.confirmation_code ?? "—"}</td>
                    <td>{formatDateTime(r.submitted_at)}</td>
                    <td><Link className="font-semibold text-marian hover:underline" href={`/admin/personas/${r.id}`}>Ver</Link></td>
                  </tr>
                ))}
                {!list.rows.length && <tr><td colSpan={7} className="py-8 text-center text-ink-muted">No hay registros con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>{list.total.toLocaleString("es-EC")} registros</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="rounded-lg px-3 py-2 text-marian hover:bg-marian-soft" href={qs({ p: page - 1 })}>Anterior</Link>}
              {page * PAGE_SIZE < list.total && <Link className="rounded-lg px-3 py-2 text-marian hover:bg-marian-soft" href={qs({ p: page + 1 })}>Siguiente</Link>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
