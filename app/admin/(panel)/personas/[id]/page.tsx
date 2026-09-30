import Link from "next/link";
import { notFound } from "next/navigation";
import { PersonActions } from "@/components/admin/person-actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { getRepo } from "@/lib/database";
import { decrypt } from "@/lib/encryption/crypto";
import { maskAccount, maskCedula } from "@/lib/security/masking";
import { can } from "@/lib/security/rbac";
import { requireAdmin } from "@/lib/server/admin-guard";
import { formatDateTime } from "@/lib/utils";

const REASONS: Record<string, string> = {
  NAMES_CORRECTED: "El titular corrigió nombres o apellidos",
  THIRD_PARTY_ACCOUNT: "La cuenta bancaria pertenece a otra persona",
};

const CONSENTS: Record<string, string> = {
  PRIVACY_NOTICE: "Tratamiento de datos (aviso de privacidad)",
  DATA_SHARING_AIG: "Comunicación de datos a AIG",
  ACCURACY_DECLARATION: "Declaración de veracidad",
  BANK_ACCOUNT_AUTHORIZATION: "Autorización sobre la cuenta bancaria",
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requireAdmin("people:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const repo = getRepo();
  const detail = await repo.getPersonDetail(id);
  if (!detail) notFound();
  await repo.audit({ person_id: id, actor_type: "admin", actor_id: admin.id, action: "ADMIN_VIEWED" });

  const { person, contact, bank, consents, nameChanges, tokens, audit } = detail;
  let cedula = "—";
  try { cedula = person.national_id_encrypted ? maskCedula(decrypt(person.national_id_encrypted)) : "—"; } catch { /* enmascarado */ }

  return (
    <div className="space-y-8">
      <Link href="/admin" className="text-sm font-medium text-marian hover:underline">Volver al resumen</Link>
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-3xl">{person.first_names} {person.last_names}</h1>
        <StatusBadge status={person.status} />
      </header>

      {person.review_reasons.length > 0 && person.status === "NEEDS_REVIEW" && (
        <div className="rounded-xl border border-alert/30 bg-alert-soft px-4 py-3 text-sm">
          <p className="font-semibold">Motivos de revisión</p>
          <ul className="mt-1 list-disc pl-5">{person.review_reasons.map((r) => <li key={r}>{REASONS[r] ?? r}</li>)}</ul>
        </div>
      )}

      <PersonActions personId={person.id} canLinks={can(admin.role, "links:manage")} canReview={can(admin.role, "people:review")} needsReview={person.status === "NEEDS_REVIEW"} />

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
              <Item k="Tipo" v={bank.account_type} />
              <Item k="Cuenta" v={maskAccount(bank.account_number_last4)} />
              <Item k="Titular" v={`${bank.account_holder_name}${bank.holder_is_titular ? " (el asegurado)" : " (tercero)"}`} />
            </>
          ) : <p className="text-ink-muted">Sin datos todavía.</p>}
        </Card>
        <Card title="Consentimientos">
          {consents.length ? consents.map((c) => (
            <Item key={c.consent_type} k={CONSENTS[c.consent_type] ?? c.consent_type} v={`${formatDateTime(c.accepted_at)} · v${c.privacy_notice_version}${c.revoked_at ? " · revocado" : ""}`} />
          )) : <p className="text-ink-muted">Sin consentimientos registrados.</p>}
        </Card>
      </div>

      {nameChanges.length > 0 && (
        <Card title="Correcciones de nombre">
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Original</th><th>Nuevo</th></tr></thead>
            <tbody>{nameChanges.map((n) => (
              <tr key={n.created_at}><td>{formatDateTime(n.created_at)}</td><td>{n.original_first_names} {n.original_last_names}</td><td>{n.new_first_names} {n.new_last_names}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <Card title="Enlaces">
        <table className="admin-table">
          <thead><tr><th>Creado</th><th>Expira</th><th>Estado</th><th>Intentos fallidos</th></tr></thead>
          <tbody>{tokens.map((t) => (
            <tr key={t.id}>
              <td>{formatDateTime(t.created_at)}</td><td>{formatDateTime(t.expires_at)}</td>
              <td>{t.used_at ? "Usado" : t.revoked_at ? `Revocado (${t.revoked_reason ?? ""})` : new Date(t.expires_at) < new Date() ? "Vencido" : "Vigente"}</td>
              <td>{t.failed_attempts}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      <Card title="Auditoría del registro">
        <table className="admin-table">
          <thead><tr><th>Fecha</th><th>Evento</th><th>Actor</th><th>Campos</th></tr></thead>
          <tbody>{audit.map((a) => (
            <tr key={a.id}><td className="whitespace-nowrap">{formatDateTime(a.created_at)}</td><td>{a.action}</td><td>{a.actor_type}</td><td className="text-xs text-ink-muted">{a.changed_fields.join(", ")}</td></tr>
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
    <div className="grid grid-cols-[150px_1fr] gap-3 text-sm">
      <span className="text-ink-muted">{k}</span>
      <span className="break-words font-medium">{v || "—"}</span>
    </div>
  );
}
