import { CheckCircle2, ClipboardCheck, CircleDashed, FileDown, FileUp, History, Mail, Play, UserPlus, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { LinkAccount } from "@/components/admin/link-account";
import { PeopleTable } from "@/components/admin/people-table";
import { PeopleToolbar } from "@/components/admin/people-toolbar";
import { PageHeader, AdminPage } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/admin/ui/pagination";
import { SectionCard } from "@/components/admin/ui/section-card";
import { TableShell } from "@/components/admin/ui/table-shell";
import { AnimatedNumber, Meter, Stagger, StaggerItem } from "@/components/motion/primitives";
import { Notice } from "@/components/ui/notice";
import { autoLinkMatchLabel } from "@/lib/admin/auto-links";
import { buildQuery, parsePageParam, parsePeopleSort, parseStatusParam, totalPages } from "@/lib/admin/people-query";
import { getRepo } from "@/lib/database";
import { keyedHash } from "@/lib/encryption/crypto";
import { maskCedulaTail, maskEmail } from "@/lib/security/masking";
import { can, type Permission } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";
import { cn, formatDateTime } from "@/lib/utils";
import { assessNationalId } from "@/lib/validation/document";
import { STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";

const PAGE_SIZE = 25;
const AUTO_LINKS_SHOWN = 5;

const KPI: { status: PersonStatus; Icon: LucideIcon; tone: string; hint: string }[] = [
  { status: "PENDING", Icon: CircleDashed, tone: "bg-marian-soft text-ink", hint: "Todavía no abren su enlace" },
  { status: "STARTED", Icon: Play, tone: "bg-warn-soft text-ink", hint: "Empezaron y no terminaron" },
  { status: "COMPLETED", Icon: CheckCircle2, tone: "bg-ok-soft text-ok", hint: "Enviaron su información" },
  { status: "NEEDS_REVIEW", Icon: ClipboardCheck, tone: "bg-alert-soft text-alert", hint: "Un revisor debe mirarlos" },
];

const QUICK_ACTIONS: { href: string; title: string; text: string; Icon: LucideIcon; perm: Permission }[] = [
  { href: "/admin/importar", title: "Cargar personas", text: "Subir el archivo inicial y generar sus enlaces", Icon: FileUp, perm: "people:import" },
  { href: "/admin/exportar", title: "Descargar para AIG", text: "Completados y revisados, listos para enviar", Icon: FileDown, perm: "export:create" },
  { href: "/admin/auditoria", title: "Revisar la actividad", text: "Quién hizo qué y cuándo en el panel", Icon: History, perm: "audit:view" },
  { href: "/admin/invitar", title: "Dar acceso al panel", text: "Invitar a un revisor o a quien exporta", Icon: UserPlus, perm: "staff:invite" },
];

export const metadata = { title: "Resumen" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; p?: string; orden?: string; dir?: string; denegado?: string }> }) {
  const { admin } = await requireAdmin("dashboard:view");
  const sp = await searchParams;
  const repo = getRepo();
  const counts = await repo.statusCounts();
  const pendingEmailInvites = await repo.pendingEmailInvites();
  const autoLinks = await repo.listAutoLinksSince("1970-01-01T00:00:00.000Z");
  const invited = Object.values(counts).reduce((a, b) => a + b, 0);
  const completionPct = invited ? (counts.COMPLETED / invited) * 100 : 0;

  const canView = can(admin.role, "people:view");
  const status = parseStatusParam(sp.estado);
  const q = (sp.q ?? "").trim().slice(0, 60);
  const sort = parsePeopleSort(sp.orden, sp.dir);
  const requestedPage = parsePageParam(sp.p);
  const documentQuery = assessNationalId(q);
  const listQuery = {
    status,
    pageSize: PAGE_SIZE,
    sort,
    ...(documentQuery.ok ? { nationalIdHash: keyedHash(documentQuery.value, "national_id") } : { search: q || undefined }),
  };
  let list = canView ? await repo.listPeople({ ...listQuery, page: requestedPage }) : null;
  const pages = list ? totalPages(list.total, PAGE_SIZE) : 1;
  const page = Math.min(requestedPage, pages);
  if (list && page !== requestedPage) list = await repo.listPeople({ ...listQuery, page });

  const needsReview = counts.NEEDS_REVIEW;
  const canLink = can(admin.role, "people:reset-factors");
  const unlinked = canLink ? await repo.listUnlinkedAccounts(50) : [];
  const actions = QUICK_ACTIONS.filter((a) => can(admin.role, a.perm));
  const pageHref = (p: number) => buildQuery({ estado: status, q, orden: sort ? sp.orden : undefined, dir: sort ? sort.dir : undefined, p: p > 1 ? p : undefined });

  return (
    <AdminPage>
      {sp.denegado && <Notice tone="warning">Tu rol no tiene permiso para esa sección.</Notice>}
      <PageHeader
        title="Resumen"
        description="Cómo va la actualización de datos de las personas invitadas. Toca un estado para ver solo esas personas."
      />

      {canView && needsReview > 0 && status !== "NEEDS_REVIEW" && (
        <Notice tone="warning" title="Hay registros esperando tu revisión">
          {needsReview.toLocaleString("es-EC")} {needsReview === 1 ? "registro requiere" : "registros requieren"} una revisión manual antes del archivo para AIG.{" "}
          <Link className="font-semibold text-marian underline underline-offset-2" href="?estado=NEEDS_REVIEW#personas">Ver registros por revisar</Link>
        </Notice>
      )}

      <section aria-label="Avance general" className="admin-card flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <div className="shrink-0">
          <p className="text-sm font-medium text-ink-muted">Avance de actualización</p>
          <p className="font-serif text-5xl font-semibold text-marian"><AnimatedNumber value={Math.round(completionPct)} />%</p>
        </div>
        <div className="flex-1 space-y-2">
          <Meter percent={completionPct} label="Porcentaje de personas que completaron su actualización" />
          <p className="flex items-center gap-1.5 text-[15px] text-ink-muted">
            <UsersRound className="h-4 w-4 shrink-0" aria-hidden />
            {counts.COMPLETED.toLocaleString("es-EC")} de {invited.toLocaleString("es-EC")} personas completaron el proceso.
          </p>
        </div>
      </section>

      <section aria-label="Personas por estado" className="space-y-3">
        <Stagger as="ul" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPI.map(({ status: s, Icon, tone, hint }) => {
            const active = canView && status === s;
            const share = invited ? Math.round((counts[s] / invited) * 100) : 0;
            const body = (
              <>
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="text-sm font-medium tabular-nums text-ink-muted">{share}%</span>
                </span>
                <span className="mt-3 block text-[15px] font-semibold text-ink">{STATUS_LABELS[s]}</span>
                <AnimatedNumber value={counts[s]} className="mt-0.5 block font-serif text-4xl font-semibold text-marian" />
                <span className="mt-1 block text-[13px] leading-snug text-ink-muted">{hint}</span>
              </>
            );
            return (
              <StaggerItem as="li" key={s}>
                {canView ? (
                  <Link
                    href={active ? "?" : `?estado=${s}#personas`}
                    aria-current={active ? "true" : undefined}
                    className={cn("admin-card block h-full !p-4 transition-colors hover:border-marian", active && "border-marian bg-marian-soft/60")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="admin-card h-full !p-4">{body}</div>
                )}
              </StaggerItem>
            );
          })}
        </Stagger>
      </section>

      {actions.length > 0 && (
        <section aria-labelledby="acciones-rapidas" className="space-y-3">
          <h2 id="acciones-rapidas" className="section-title">Acciones rápidas</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {actions.map(({ href, title, text, Icon }) => (
              <li key={href}>
                <Link href={href} className="admin-card flex h-full items-start gap-3 !p-4 transition-colors hover:border-marian hover:bg-marian-soft/40">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marian-soft text-marian"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{title}</span>
                    <span className="block text-[13px] leading-snug text-ink-muted">{text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-label="Invitados por correo (pendientes)" className="admin-card flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marian-soft text-marian"><Mail className="h-5 w-5" aria-hidden /></span>
          <div>
            <p className="text-sm font-medium text-ink-muted">Invitados por correo (pendientes)</p>
            <AnimatedNumber value={pendingEmailInvites} className="mt-0.5 block font-serif text-4xl font-semibold text-marian" />
            <p className="mt-1 text-sm text-ink-muted">Correos de la lista que todavía no están en una ficha. Un teléfono sin correo sigue contando.</p>
          </div>
        </section>

        <section aria-label="Vinculados automáticamente" className="admin-card space-y-3">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marian-soft text-marian"><UsersRound className="h-5 w-5" aria-hidden /></span>
            <div>
              <p className="text-sm font-medium text-ink-muted">Vinculados automáticamente</p>
              <AnimatedNumber value={autoLinks.length} className="mt-0.5 block font-serif text-4xl font-semibold text-marian" />
              <p className="mt-1 text-sm text-ink-muted">Los más recientes, no solo los de hoy. Si una persona no es quien dice, abre su ficha y restablécela.</p>
            </div>
          </div>
          {autoLinks.length > 0 && (
            <AutoLinkList rows={autoLinks.slice(0, AUTO_LINKS_SHOWN)} canView={canView} />
          )}
          {autoLinks.length > AUTO_LINKS_SHOWN && (
            <details className="group">
              <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-sm font-semibold text-marian underline-offset-2 hover:underline">
                Ver los {autoLinks.length - AUTO_LINKS_SHOWN} restantes
              </summary>
              <div className="pt-2"><AutoLinkList rows={autoLinks.slice(AUTO_LINKS_SHOWN)} canView={canView} /></div>
            </details>
          )}
        </section>
      </div>

      {list && (
        <section className="scroll-mt-24 space-y-4" aria-labelledby="personas">
          <div className="space-y-1">
            <h2 id="personas" className="section-title">
              Registros
              {status && <span className="ml-2 text-lg font-normal text-ink-muted">· {STATUS_LABELS[status]}</span>}
            </h2>
            <p className="section-lead">Busca por nombre, cédula, pasaporte o código de confirmación. Toca un encabezado para ordenar.</p>
          </div>
          <PeopleToolbar q={q} status={status} orden={sort ? sp.orden : undefined} dir={sort ? sort.dir : undefined} counts={counts} total={invited} />
          <PeopleTable rows={list.rows} filters={{ q, status, sort }} />
          <Pagination page={page} pages={pages} total={list.total} pageSize={PAGE_SIZE} noun="registro" nounPlural="registros" href={pageHref} />
        </section>
      )}

      {canLink && unlinked.length > 0 && (
        <SectionCard
          id="sin-vincular"
          title="Cuentas sin vincular"
          description="Personas que entraron con un correo que no estaba en la importación. No abren el formulario hasta que las vincules con su ficha. Revisa la identidad antes de vincular."
        >
          <TableShell label="Cuentas sin vincular">
            <table className="admin-table">
              <caption className="sr-only">Cuentas que esperan vincularse con una ficha</caption>
              <thead>
                <tr>
                  <th scope="col">Correo</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Cédula pedida</th>
                  <th scope="col">Vincular</th>
                </tr>
              </thead>
              <tbody>
                {unlinked.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td>{maskEmail(row.login_email)}</td>
                    <td className="whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                    <td className="tabular-nums">{row.link_request_national_id_last2 ? maskCedulaTail(row.link_request_national_id_last2) : "—"}</td>
                    <td><LinkAccount accountId={row.id} requestedLast2={row.link_request_national_id_last2} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </SectionCard>
      )}
    </AdminPage>
  );
}

function AutoLinkList({ rows, canView }: { rows: Awaited<ReturnType<ReturnType<typeof getRepo>["listAutoLinksSince"]>>; canView: boolean }) {
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((row) => (
        <li key={`${row.personId ?? "sin"}-${row.createdAt}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-marian-line/60 pt-2">
          <span>{autoLinkMatchLabel(row.match)} · <span className="tabular-nums">{row.maskedCedula || "cédula oculta"}</span></span>
          {canView && row.personId ? (
            <Link className="inline-flex min-h-[44px] items-center font-semibold text-marian underline underline-offset-2" href={`/admin/personas/${row.personId}`}>Ver ficha</Link>
          ) : (
            <span className="text-ink-muted">{formatDateTime(row.createdAt)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
