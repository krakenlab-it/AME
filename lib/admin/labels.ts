import type { AuditAction } from "@/lib/database/types";
import type { AdminRole } from "@/lib/security/rbac";

/** Texto para personas (no técnicas) de cada evento de auditoría. Exhaustivo: un evento nuevo no compila sin etiqueta. */
export const AUDIT_LABELS: Record<AuditAction, string> = {
  RECORD_OPENED: "Abrió su enlace",
  IDENTITY_VERIFIED: "Confirmó su cédula",
  IDENTITY_FAILED: "Falló la verificación de cédula",
  DATA_UPDATED: "Actualizó sus datos",
  NAMES_CORRECTED: "Corrigió nombres o apellidos",
  CONSENT_ACCEPTED: "Aceptó las autorizaciones de privacidad",
  FORM_SUBMITTED: "Envió el formulario",
  ADMIN_VIEWED: "Un administrador vio la ficha",
  ADMIN_LOGIN: "Ingreso al panel",
  ADMIN_LOGIN_FAILED: "Intento de ingreso fallido",
  ADMIN_LOGOUT: "Salida del panel",
  MFA_ENROLLED: "Configuró la verificación en dos pasos",
  EXPORT_CREATED: "Generó un archivo para AIG",
  IMPORT_CREATED: "Importó una base de personas",
  LINK_CREATED: "Se creó un enlace personal",
  LINK_REVOKED: "Se revocó un enlace personal",
  LINK_EMAIL_SENT: "Envió enlaces personales por correo",
  RECORD_REVIEWED: "Marcó el registro como revisado",
  MANUAL_EDIT: "Corrigió la ficha manualmente",
  UNIBROKERS_EXPORT_CREATED: "Generó la carga de contacto para Unibrokers",
  NOTICE_PUBLISHED: "Publicó una versión del aviso de privacidad",
  RETENTION_APPLIED: "Se anonimizaron registros por vencimiento",
};

export const AUDIT_ACTIONS = Object.keys(AUDIT_LABELS) as AuditAction[];

export function isAuditAction(value: string | undefined): value is AuditAction {
  return value !== undefined && Object.hasOwn(AUDIT_LABELS, value);
}

export function auditLabel(action: string): string {
  return isAuditAction(action) ? AUDIT_LABELS[action] : action;
}

export const ACTOR_LABELS: Record<"respondent" | "admin" | "system", string> = {
  respondent: "Titular",
  admin: "Administración",
  system: "Sistema",
};

export function actorLabel(actor: string): string {
  return Object.hasOwn(ACTOR_LABELS, actor) ? ACTOR_LABELS[actor as keyof typeof ACTOR_LABELS] : actor;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "Administrador",
  REVIEWER: "Revisor de fichas",
  EXPORTER: "Exportación a AIG",
};

/** Una frase para dejar claro que es el mismo panel, con un trabajo más chico. */
export const ROLE_SCOPE: Record<AdminRole, string> = {
  ADMIN: "Panel completo",
  REVIEWER: "Mismo panel: solo revisar fichas",
  EXPORTER: "Mismo panel: solo el archivo para AIG",
};

export const REVIEW_REASON_LABELS: Record<string, string> = {
  NAMES_CORRECTED: "El titular corrigió nombres o apellidos",
  THIRD_PARTY_ACCOUNT: "La cuenta bancaria pertenece a otra persona",
};

export const CONSENT_LABELS: Record<string, string> = {
  PRIVACY_NOTICE: "Tratamiento de datos (aviso de privacidad)",
  DATA_SHARING_AIG: "Comunicación de datos a AIG",
  ACCURACY_DECLARATION: "Declaración de veracidad",
  BANK_ACCOUNT_AUTHORIZATION: "Autorización sobre la cuenta bancaria",
};
