import Link from "next/link";
import { notFound } from "next/navigation";
import { ManualEditForm } from "@/components/admin/manual-edit-form";
import { PersonActions } from "@/components/admin/person-actions";
import { ResetGeneralAuth } from "@/components/admin/reset-general-auth";
import { StatusBadge } from "@/components/admin/status-badge";
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

  return (
    <div className="space-y-8">
      <nav aria-label="Ruta de navegación" className="text-sm">
        <Link href="/admin" className="inline-flex min-h-[44px] items-center font-semibold text-marian underline-offset-2 hover:underline">← Volver al resumen</Link>
      </nav>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl">{person.first_names} {person.last_names}</h1>
        <StatusBadge status={person.status} />
      </header>

      {person.review_reasons.length > 0 && person.status === "NEEDS_REVIEW" && (
        <Notice tone="error" title="Este registro requiere revisión">
          <ul className="list-disc pl-5">{person.review_reasons.map((r) => <li key={r}>{REVIEW_REASON_LABELS[r] ?? r}</li>)}</ul>
        </Notice>
      )}

      <PersonActions personId={person.id} canLinks={can(admin.role, "links:manage")} canReview={can(admin.role, "people:review")} needsReview={person.status === "NEEDS_REVIEW"} />

      <Card title="Ingreso general">
        <Item k="Código dactilar" v={detail.general_access.fingerprint_set ? "Registrado" : "Sin registrar"} />
        <Item k="Verificación del teléfono" v={detail.general_access.totp_enabled ? "Activa" : "Sin configurar"} />
        <Item k="Bloqueo temporal" v={detail.general_access.locked ? "Sí" : "No"} />
      </Card>

      {can(admin.role, "people:reset-factors") && <ResetGeneralAuth personId={person.id} />}

      {can(admin.role, "people:edit") && (
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
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Identificación">
          <Item k="Cédula" v={cedula} />
          <Item k="Confirmación" v={person.confirmation_code ?? "—"} />
          <Item k="Enviado" v={formatDateTime(person.submitted_at)} />
          <Item k="Revisado" v={formatDateTime(person.reviewed_at)} />
          <Item k="Conservar hasta" v={formatDateTime(person.retention_until)} />
        </Card>
        <Card title="Contacto">
          {contact ? (
            <>
              <Item k="Correo" v={contact.primary_email ?? "—"} />
              <Item k="Correo alternativo" v={contact.secondary_email ?? "—"} />
              <Item k="Celular" v={contact.mobile_phone ?? "—"} />
              <Item k="Dirección" v={[contact.address_line_1, contact.address_line_2, contact.city, contact.province, contact.country, contact.postal_code].filter(Boolean).join(", ")} />
            </>
          ) : <p className="text-ink-muted">Sin datos todavía.</p>}
        </Card>
        <Card title="Información bancaria">
          {bank ? (
            <>
              <Item k="Banco" v={bank.bank_other_name ? `${bank.bank_name}: ${bank.bank_other_name}` : bank.bank_name} />
              <Item k="Tipo de cuenta" v={bank.account_type} />
              <Item k="Cuenta" v={maskAccount(bank.account_number_last4)} />
              <Item k="Titular" v={`${bank.account_holder_name}${bank.holder_is_titular ? " (el asegurado)" : " (tercero)"}`} />
            </>
          ) : <p className="text-ink-muted">Sin datos todavía.</p>}
        </Card>
        <Card title="Consentimientos">
          {consents.length ? consents.map((c) => (
            <Item key={c.consent_type} k={CONSENT_LABELS[c.consent_type] ?? c.consent_type} v={`${formatDateTime(c.accepted_at)} · v${c.privacy_notice_version}${c.revoked_at ? " · revocado" : ""}`} />
          )) : <p className="text-ink-muted">Sin consentimientos registrados.</p>}
        </Card>
      </div>

      {nameChanges.length > 0 && (
        <Card title="Correcciones de nombre">
          <table className="admin-table">
            <caption className="sr-only">Correcciones de nombre</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Original</th><th scope="col">Nuevo</th></tr></thead>
            <tbody>{nameChanges.map((n) => (
              <tr key={n.created_at}><td>{formatDateTime(n.created_at)}</td><td>{n.original_first_names} {n.original_last_names}</td><td>{n.new_first_names} {n.new_last_names}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <Card title="Enlaces">
        <table className="admin-table">
          <caption className="sr-only">Enlaces personales</caption>
          <thead><tr><th scope="col">Creado</th><th scope="col">Expira</th><th scope="col">Estado</th><th scope="col">Intentos fallidos</th></tr></thead>
          <tbody>{tokens.map((t) => (
            <tr key={t.id}>
              <td>{formatDateTime(t.created_at)}</td><td>{formatDateTime(t.expires_at)}</td>
              <td>{t.used_at ? "Usado" : t.revoked_at ? "Revocado" : new Date(t.expires_at) < new Date() ? "Vencido" : "Vigente"}</td>
              <td>{t.failed_attempts}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      <Card title="Auditoría del registro">
        <table className="admin-table">
          <caption className="sr-only">Historial de eventos de este registro</caption>
          <thead><tr><th scope="col">Fecha</th><th scope="col">Evento</th><th scope="col">Quién</th><th scope="col">Campos</th></tr></thead>
          <tbody>{audit.map((a) => (
            <tr key={a.id}><td className="whitespace-nowrap">{formatDateTime(a.created_at)}</td><td>{auditLabel(a.action)}</td><td>{actorLabel(a.actor_type)}</td><td className="text-xs text-ink-muted">{a.changed_fields.join(", ")}</td></tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sheet space-y-3 overflow-x-auto p-5">
      <h2 className="text-lg">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
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
