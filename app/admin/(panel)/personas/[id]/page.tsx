import { notFound } from "next/navigation";
import { ManualEditForm } from "@/components/admin/manual-edit-form";
import { PersonActions } from "@/components/admin/person-actions";
import { PersonLifecycleActions } from "@/components/admin/person-lifecycle-actions";
import { ResetGeneralAuth } from "@/components/admin/reset-general-auth";
import { StatusBadge } from "@/components/admin/status-badge";
import { AdminPage, PageHeader } from "@/components/admin/ui/page-header";
import { SectionCard } from "@/components/admin/ui/section-card";
import { TableShell } from "@/components/admin/ui/table-shell";
import { actorLabel, auditLabel, CONSENT_LABELS, REVIEW_REASON_LABELS } from "@/lib/admin/labels";
import { Notice } from "@/components/ui/notice";
import { getRepo } from "@/lib/database";
import { decrypt } from "@/lib/encryption/crypto";
import { maskAccount, maskCedula } from "@/lib/security/masking";
import { can } from "@/lib/security/rbac";
import { manualEditVerificationQr } from "@/lib/server/manual-edit-qr";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requireAdmin("people:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = getRepo();
  const detail = await repo.getPersonDetail(id);
  if (!detail) notFound();
  await repo.audit({ person_id: id, actor_type: "admin", actor_id: admin.id, action: "ADMIN_VIEWED" });

  const { person, contact, bank, consents, nameChanges, tokens, audit } = detail;
  const verificationQr = can(admin.role, "people:edit") ? await manualEditVerificationQr() : null;
  let cedula = "—";
  try { cedula = person.national_id_encrypted ? maskCedula(decrypt(person.national_id_encrypted)) : "—"; } catch { /* enmascarado */ }

  const canReset = can(admin.role, "people:reset-factors");
  const canEdit = can(admin.role, "people:edit");
  const jumps = [
    { href: "#datos", label: "Datos" },
    { href: "#acciones", label: "Acciones" },
    ...(canEdit ? [{ href: "#cambio-manual", label: "Cambio manual" }] : []),
    { href: "#historial", label: "Historial" },
    ...(canReset ? [{ href: "#zona-delicada", label: "Zona delicada" }] : []),
  ];

  return (
    <AdminPage>
      <PageHeader
        back={{ href: "/admin", label: "Volver al resumen" }}
        title={`${person.first_names} ${person.last_names}`}
        badge={<StatusBadge status={person.status} />}
        description="Ficha de la persona. Cada consulta y cada cambio quedan en la auditoría."
      />

      {person.review_reasons.length > 0 && person.status === "NEEDS_REVIEW" && (
        <Notice tone="error" title="Este registro requiere revisión">
          <ul className="list-disc pl-5">{person.review_reasons.map((r) => <li key={r}>{REVIEW_REASON_LABELS[r] ?? r}</li>)}</ul>
        </Notice>
      )}

      <nav aria-label="Secciones de la ficha">
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {jumps.map((j) => (
            <li key={j.href}>
              <a href={j.href} className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border border-marian-line bg-white px-4 text-sm font-semibold text-marian hover:border-marian hover:bg-marian-soft/50">{j.label}</a>
            </li>
          ))}
        </ul>
      </nav>

      <div id="datos" className="grid scroll-mt-24 items-start gap-5 md:grid-cols-2">
        <SectionCard id="identificacion" title="Identificación">
          <Item k="Cédula" v={cedula} />
          <Item k="Confirmación" v={person.confirmation_code ?? "—"} />
          <Item k="Enviado" v={formatDateTime(person.submitted_at)} />
          <Item k="Revisado" v={formatDateTime(person.reviewed_at)} />
          <Item k="Conservar hasta" v={formatDateTime(person.retention_until)} />
        </SectionCard>
        <SectionCard id="contacto" title="Contacto">
          {contact ? (
            <>
              <Item k="Correo" v={contact.primary_email ?? "—"} />
              <Item k="Correo alternativo" v={contact.secondary_email ?? "—"} />
              <Item k="Celular" v={contact.mobile_phone ?? "—"} />
              <Item k="Dirección" v={[contact.address_line_1, contact.address_line_2, contact.city, contact.province, contact.country, contact.postal_code].filter(Boolean).join(", ")} />
            </>
          ) : <p className="text-ink-muted">Sin datos todavía.</p>}
        </SectionCard>
        <SectionCard id="banco" title="Información bancaria">
          {bank ? (
            <>
              <Item k="Banco" v={bank.bank_other_name ? `${bank.bank_name}: ${bank.bank_other_name}` : bank.bank_name} />
              <Item k="Tipo de cuenta" v={bank.account_type} />
              <Item k="Cuenta" v={maskAccount(bank.account_number_last4)} />
              <Item k="Titular" v={`${bank.account_holder_name}${bank.holder_is_titular ? " (el asegurado)" : " (tercero)"}`} />
            </>
          ) : <p className="text-ink-muted">Sin datos todavía.</p>}
        </SectionCard>
        <SectionCard id="consentimientos" title="Consentimientos">
          {consents.length ? consents.map((c) => (
            <Item key={c.consent_type} k={CONSENT_LABELS[c.consent_type] ?? c.consent_type} v={`${formatDateTime(c.accepted_at)} · v${c.privacy_notice_version}${c.revoked_at ? " · revocado" : ""}`} />
          )) : <p className="text-ink-muted">Sin consentimientos registrados.</p>}
        </SectionCard>
      </div>

      <div id="acciones" className="grid scroll-mt-24 items-start gap-5 lg:grid-cols-2">
        <SectionCard id="enlaces-acciones" title="Enlaces y revisión" description="Genera un enlace nuevo, revoca los vigentes o marca el registro como revisado.">
          <PersonActions personId={person.id} canLinks={can(admin.role, "links:manage")} canReview={can(admin.role, "people:review")} needsReview={person.status === "NEEDS_REVIEW"} />
        </SectionCard>
        <SectionCard id="ingreso-general" title="Ingreso general">
          <Item k="Código dactilar" v={detail.general_access.fingerprint_set ? "Registrado" : "Sin registrar"} />
          <Item k="Verificación del teléfono" v={detail.general_access.totp_enabled ? "Activa" : "Sin configurar"} />
          <Item k="Correo de ingreso" v={detail.general_access.email_verified ? "Confirmado con código" : "Sin confirmar"} />
          <Item k="Bloqueo temporal" v={detail.general_access.locked ? "Sí" : "No"} />
        </SectionCard>
      </div>

      {canReset && <ResetGeneralAuth personId={person.id} />}

      {canEdit && (
        <div id="cambio-manual" className="scroll-mt-24">
          <ManualEditForm
            personId={person.id}
            firstNames={person.first_names}
            lastNames={person.last_names}
            outreachEmail={detail.outreach_email ?? ""}
            contact={contact ? {
              primaryEmail: contact.primary_email ?? "",
              secondaryEmail: contact.secondary_email ?? "",
              mobilePhone: contact.mobile_phone ?? "",
              addressLine1: contact.address_line_1 ?? "",
              addressLine2: contact.address_line_2 ?? "",
              city: contact.city ?? "",
              province: contact.province ?? "",
              country: contact.country ?? "Ecuador",
              postalCode: contact.postal_code ?? "",
            } : null}
            verificationQr={verificationQr}
          />
        </div>
      )}

      <div id="historial" className="scroll-mt-24 space-y-5">
        {nameChanges.length > 0 && (
          <SectionCard id="correcciones" title="Correcciones de nombre">
            <TableShell label="Correcciones de nombre">
              <table className="admin-table">
                <caption className="sr-only">Correcciones de nombre</caption>
                <thead><tr><th scope="col">Fecha</th><th scope="col">Original</th><th scope="col">Nuevo</th></tr></thead>
                <tbody>{nameChanges.map((n) => (
                  <tr key={n.created_at}><td className="whitespace-nowrap">{formatDateTime(n.created_at)}</td><td>{n.original_first_names} {n.original_last_names}</td><td>{n.new_first_names} {n.new_last_names}</td></tr>
                ))}</tbody>
              </table>
            </TableShell>
          </SectionCard>
        )}

        <SectionCard id="enlaces" title="Enlaces">
          <TableShell label="Enlaces personales">
            <table className="admin-table">
              <caption className="sr-only">Enlaces personales</caption>
              <thead><tr><th scope="col">Creado</th><th scope="col">Expira</th><th scope="col">Estado</th><th scope="col">Intentos fallidos</th></tr></thead>
              <tbody>{tokens.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{formatDateTime(t.created_at)}</td><td className="whitespace-nowrap">{formatDateTime(t.expires_at)}</td>
                  <td>{t.used_at ? "Usado" : t.revoked_at ? "Revocado" : new Date(t.expires_at) < new Date() ? "Vencido" : "Vigente"}</td>
                  <td>{t.failed_attempts}</td>
                </tr>
              ))}</tbody>
            </table>
            {tokens.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">Esta persona no tiene enlaces.</p>}
          </TableShell>
        </SectionCard>

        <SectionCard id="auditoria-registro" title="Auditoría del registro">
          <TableShell label="Historial de eventos de este registro">
            <table className="admin-table">
              <caption className="sr-only">Historial de eventos de este registro</caption>
              <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Quién</th><th scope="col" className="max-md:hidden">Campos</th></tr></thead>
              <tbody>{audit.map((a) => (
                <tr key={a.id}><td className="whitespace-nowrap">{formatDateTime(a.created_at)}</td><td>{auditLabel(a.action)}</td><td>{actorLabel(a.actor_type)}</td><td className="text-xs text-ink-muted max-md:hidden">{a.changed_fields.join(", ")}</td></tr>
              ))}</tbody>
            </table>
            {audit.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">Todavía no hay eventos.</p>}
          </TableShell>
        </SectionCard>
      </div>

      {canReset && (
        <section id="zona-delicada" aria-labelledby="zona-delicada-title" className="scroll-mt-24 space-y-4">
          <div className="space-y-1">
            <h2 id="zona-delicada-title" className="section-title text-alert">Zona delicada</h2>
            <p className="section-lead">Estas acciones borran información y no se pueden deshacer. Piden tu código del administrador y un motivo, y quedan en la auditoría.</p>
          </div>
          <PersonLifecycleActions personId={person.id} />
        </section>
      )}
    </AdminPage>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <dl className="grid gap-0.5 text-sm sm:grid-cols-[150px_1fr] sm:gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="break-words font-medium">{v || "—"}</dd>
    </dl>
  );
}
