import { CheckCircle2, Clock, Hourglass, Play, Users, ClipboardCheck, Search, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { AnimatedNumber, Meter, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";
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

  const cards: { label: string; value: number; status: PersonStatus | null; Icon: LucideIcon; tone: string }[] = [
    { label: "Invitados", value: invited, status: null, Icon: Users, tone: "bg-marian-soft text-marian" },
    { label: "Pendientes", value: counts.PENDING, status: "PENDING", Icon: Hourglass, tone: "bg-marian-soft text-ink" },
    { label: "Iniciados", value: counts.STARTED, status: "STARTED", Icon: Play, tone: "bg-warn-soft text-ink" },
    { label: "Completados", value: counts.COMPLETED, status: "COMPLETED", Icon: CheckCircle2, tone: "bg-ok-soft text-ok" },
    { label: "Requieren revisión", value: counts.NEEDS_REVIEW, status: "NEEDS_REVIEW", Icon: ClipboardCheck, tone: "bg-alert-soft text-alert" },
  ];
  const completionPct = invited ? (counts.COMPLETED / invited) * 100 : 0;

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

  const needsReview = counts.NEEDS_REVIEW;

  return (
    <div className="space-y-8">
      {sp.denegado && <Notice tone="warning">Tu rol no tiene permiso para esa sección.</Notice>}
      <header className="space-y-1">
        <h1 className="text-3xl">Resumen</h1>
        <p className="text-ink-muted">Avance de las personas invitadas a actualizar sus datos. Toca una tarjeta para filtrar la lista.</p>
      </header>

      {canView && needsReview > 0 && status !== "NEEDS_REVIEW" && (
        <Notice tone="warning" title="Hay registros esperando tu revisión">
          {needsReview.toLocaleString("es-EC")} {needsReview === 1 ? "registro requiere" : "registros requieren"} una revisión manual antes del archivo para AIG.{" "}
          <Link className="font-semibold text-marian underline underline-offset-2" href="?estado=NEEDS_REVIEW">Ver registros por revisar</Link>
        </Notice>
      )}

      <section aria-label="Avance general" className="sheet flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-6">
        <div className="shrink-0">
          <p className="text-sm font-medium text-ink-muted">Avance de actualización</p>
          <p className="font-serif text-4xl font-semibold text-marian"><AnimatedNumber value={Math.round(completionPct)} />%</p>
        </div>
        <div className="flex-1 space-y-2">
          <Meter percent={completionPct} label="Porcentaje de personas que completaron su actualización" />
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Clock className="h-4 w-4" aria-hidden />
            {counts.COMPLETED.toLocaleString("es-EC")} de {invited.toLocaleString("es-EC")} personas completaron el proceso.
          </p>
        </div>
      </section>

      <Stagger as="ul" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map(({ label, value, status: s, Icon, tone }) => {
          const active = canView && (s ? status === s : !status);
          const body = (
            <>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="mt-3 block text-sm font-medium text-ink-muted">{label}</span>
              <AnimatedNumber value={value} className="mt-0.5 block font-serif text-3xl font-semibold text-marian" />
            </>
          );
          return (
            <StaggerItem as="li" key={label}>
              {canView ? (
                <Link
                  href={s ? `?estado=${s}` : "?"}
                  aria-current={active ? "true" : undefined}
                  className={`sheet block h-full p-4 transition-colors hover:border-marian ${active ? "border-marian bg-marian-soft/60" : ""}`}
                >
                  {body}
                </Link>
              ) : (
                <div className="sheet h-full p-4">{body}</div>
              )}
            </StaggerItem>
          );
        })}
      </Stagger>

      {list && (
        <section className="space-y-4" aria-labelledby="personas">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="personas" className="text-2xl">
              Registros
              {status && <span className="ml-2 text-lg font-normal text-ink-muted">· {STATUS_LABELS[status]}</span>}
            </h2>
            <form className="flex flex-wrap gap-2" role="search">
              <div>
                <label className="sr-only" htmlFor="q">Buscar por nombre, cédula o código de confirmación</label>
                <input id="q" name="q" type="search" defaultValue={q} placeholder="Nombre, cédula o AIG-…" className="field-input !min-h-[44px] w-full !py-2 text-sm sm:w-72" />
              </div>
              <div>
                <label className="sr-only" htmlFor="estado">Filtrar por estado</label>
                <select id="estado" name="estado" defaultValue={status ?? ""} className="field-input !min-h-[44px] w-full !py-2 text-sm sm:w-48">
                  <option value="">Todos los estados</option>
                  {PERSON_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <Button type="submit" size="sm"><Search className="h-4 w-4" aria-hidden />Buscar</Button>
              {(q || status) && <Link className="inline-flex min-h-[44px] items-center px-2 text-sm font-semibold text-marian underline underline-offset-2" href="?"><X className="mr-1 h-4 w-4" aria-hidden />Quitar filtros</Link>}
            </form>
          </div>
          <div className="sheet overflow-x-auto">
            <table className="admin-table">
              <caption className="sr-only">Personas invitadas y su estado</caption>
              <thead>
                <tr>
                  <th scope="col">Apellidos</th>
                  <th scope="col">Nombres</th>
                  <th scope="col">Cédula</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Confirmación</th>
                  <th scope="col">Enviado</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="text-left font-medium">{r.last_names}</th>
                    <td>{r.first_names}</td>
                    <td className="tabular-nums">{maskCedulaTail(r.national_id_last2)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="tabular-nums">{r.confirmation_code ?? "—"}</td>
                    <td>{formatDateTime(r.submitted_at)}</td>
                    <td>
                      <Link className="inline-flex min-h-[44px] items-center whitespace-nowrap font-semibold text-marian underline-offset-2 hover:underline" href={`/admin/personas/${r.id}`}>
                        Ver ficha<span className="sr-only"> de {r.first_names} {r.last_names}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
                {!list.rows.length && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-ink-muted">
                      No encontramos registros con estos filtros. Prueba con otro nombre o{" "}
                      <Link className="font-semibold text-marian underline underline-offset-2" href="?">quita los filtros</Link>.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span aria-live="polite">{list.total.toLocaleString("es-EC")} {list.total === 1 ? "registro" : "registros"} · página {page}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold text-marian hover:bg-marian-soft" href={qs({ p: page - 1 })}>← Anterior</Link>}
              {page * PAGE_SIZE < list.total && <Link className="inline-flex min-h-[44px] items-center rounded-lg px-4 font-semibold text-marian hover:bg-marian-soft" href={qs({ p: page + 1 })}>Siguiente →</Link>}
            </div>
          </nav>
        </section>
      )}
    </div>
  );
}
