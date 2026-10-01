import { REVIEW_REASON_LABELS } from "@/lib/admin/labels";
import type { InsuredRecord, NoticeRecord } from "@/lib/database/types";
import { decrypt } from "@/lib/encryption/crypto";
import { maskAccount, maskCedula, maskEmail, maskPhone } from "@/lib/security/masking";
import { STATUS_LABELS, type PersonStatus } from "@/lib/validation/constants";

export type NoticeTone = "info" | "warning" | "success";

export interface InsuredNotification {
  id: string;
  tone: NoticeTone;
  title: string;
  body: string;
}

export interface InsuredHomeView {
  firstNames: string;
  lastNames: string;
  cedulaMasked: string;
  status: PersonStatus;
  statusLabel: string;
  confirmationCode: string | null;
  submittedAt: string | null;
  editable: boolean;
  contact: { email: string; altEmail: string; phone: string; place: string } | null;
  bank: { institution: string; accountType: string; accountMasked: string; ownership: string } | null;
  notifications: InsuredNotification[];
}

/** El formulario sigue abierto solo antes del envío. Completado y en revisión son de lectura. */
export function canContinueForm(person: { status: PersonStatus; submitted_at: string | null }): boolean {
  if (person.submitted_at) return false;
  switch (person.status) {
    case "PENDING":
    case "STARTED":
      return true;
    case "COMPLETED":
    case "NEEDS_REVIEW":
      return false;
    default: {
      const exhaustive: never = person.status;
      return exhaustive;
    }
  }
}

function statusNotification(status: PersonStatus, reviewReasons: string[]): InsuredNotification {
  switch (status) {
    case "PENDING":
      return {
        id: "status-pending",
        tone: "info",
        title: "Pendiente",
        body: "Aún no inicias la actualización. Cuando tengas tu cédula, tu contacto y los datos de la cuenta, continúa el formulario.",
      };
    case "STARTED":
      return {
        id: "status-started",
        tone: "info",
        title: "Iniciado",
        body: "Confirmaste tu identidad y la actualización sigue abierta. Puedes continuar el formulario mientras tu enlace personal esté vigente.",
      };
    case "COMPLETED":
      return {
        id: "status-completed",
        tone: "success",
        title: "Completado",
        body: "Recibimos tu información. Este registro queda en consulta. Si necesitas cambiar algo, pide un enlace nuevo a quien te escribió.",
      };
    case "NEEDS_REVIEW": {
      const reasons = reviewReasons.map((reason) => REVIEW_REASON_LABELS[reason] ?? "Hay un dato que el equipo debe revisar.");
      const detail = reasons.length ? ` ${reasons.join(" ")}` : "";
      return {
        id: "status-review",
        tone: "warning",
        title: "En revisión",
        body: `Recibimos tu información y el equipo la está revisando.${detail} No hace falta volver a enviarla.`,
      };
    }
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function buildInsuredNotifications(input: {
  status: PersonStatus;
  reviewReasons: string[];
  activeNotice: Pick<NoticeRecord, "version"> | null;
  acceptedNoticeVersion: string | null;
}): InsuredNotification[] {
  const items: InsuredNotification[] = [statusNotification(input.status, input.reviewReasons)];
  if (input.activeNotice) {
    items.push({
      id: `notice-${input.activeNotice.version}`,
      tone: "info",
      title: "Aviso de privacidad vigente",
      body: `La versión publicada es ${input.activeNotice.version}. Puedes leerla en la página de privacidad.`,
    });
    if (input.acceptedNoticeVersion && input.acceptedNoticeVersion !== input.activeNotice.version) {
      items.push({
        id: "notice-mismatch",
        tone: "warning",
        title: "Hay un aviso de privacidad nuevo",
        body: `Aceptaste la versión ${input.acceptedNoticeVersion}. El envío que ya hiciste sigue con esa versión. Un enlace nuevo usaría la versión ${input.activeNotice.version}.`,
      });
    }
  } else {
    items.push({
      id: "notice-fallback",
      tone: "info",
      title: "Aviso de privacidad",
      body: "El texto vigente está en la página de privacidad del portal.",
    });
  }
  return items;
}

function maskedCedula(person: InsuredRecord["person"]): string {
  if (!person.national_id_encrypted) return maskCedula(null);
  try {
    return maskCedula(decrypt(person.national_id_encrypted));
  } catch {
    return `********${person.national_id_last2 ?? "**"}`;
  }
}

function placeOf(contact: NonNullable<InsuredRecord["contact"]>): string {
  const parts = [contact.city, contact.province, contact.country].map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return parts.join(", ");
}

/** Arma la vista de /mi-cuenta. No devuelve calle, número de cuenta ni cédula en claro. */
export function composeInsuredHome(record: InsuredRecord, activeNotice: Pick<NoticeRecord, "version"> | null): InsuredHomeView {
  const { person, contact, bank } = record;
  const institution = bank ? (bank.bank_other_name ? `${bank.bank_name} (${bank.bank_other_name})` : bank.bank_name) : "";
  return {
    firstNames: person.first_names,
    lastNames: person.last_names,
    cedulaMasked: maskedCedula(person),
    status: person.status,
    statusLabel: STATUS_LABELS[person.status],
    confirmationCode: person.confirmation_code,
    submittedAt: person.submitted_at,
    editable: canContinueForm(person),
    contact: contact
      ? {
          email: maskEmail(contact.primary_email),
          altEmail: maskEmail(contact.secondary_email),
          phone: maskPhone(contact.mobile_phone),
          place: placeOf(contact),
        }
      : null,
    bank: bank
      ? {
          institution,
          accountType: bank.account_type,
          accountMasked: maskAccount(bank.account_number_last4),
          ownership: bank.holder_is_titular ? "Cuenta del asegurado" : "Cuenta de un tercero",
        }
      : null,
    notifications: buildInsuredNotifications({
      status: person.status,
      reviewReasons: person.review_reasons,
      activeNotice,
      acceptedNoticeVersion: record.notice_version,
    }),
  };
}
