/**
 * ⚠️ LEGAL_REVIEW_REQUIRED
 * Datos legales del Responsable del tratamiento. NO se inventan: se leen de variables
 * de entorno y, mientras falten, se muestran placeholders entre corchetes.
 * En producción el portal se bloquea automáticamente si queda algún placeholder
 * o si LEGAL_REVIEW_APPROVED no es "true" (ver lib/privacy/readiness.ts).
 */
import { z } from "zod";

const retentionSchema = z.object({
  months: z.number().int().positive().max(600),
  reason: z.string().min(1),
  expiresAt: z.string().optional().default(""),
});

export type RetentionPolicy = z.infer<typeof retentionSchema>;

function readRetention(): RetentionPolicy {
  const fallback: RetentionPolicy = {
    months: 60,
    reason: "[MOTIVO / BASE LEGAL O CONTRACTUAL DEL PLAZO DE CONSERVACIÓN]",
    expiresAt: "",
  };
  const raw = process.env.DATA_RETENTION_POLICY;
  if (!raw) return fallback;
  try {
    return retentionSchema.parse(JSON.parse(raw));
  } catch {
    console.error("DATA_RETENTION_POLICY no es un JSON válido; se usa el valor por defecto con placeholder.");
    return fallback;
  }
}

const v = (name: string, placeholder: string) => {
  const value = process.env[name]?.trim();
  return value ? value : placeholder;
};

export function getPrivacyConfig() {
  const retention = readRetention();
  return {
    responsibleLegalName: v("PRIVACY_RESPONSIBLE_LEGAL_NAME", "[NOMBRE LEGAL DEL RESPONSABLE DEL TRATAMIENTO]"),
    responsibleRuc: v("PRIVACY_RESPONSIBLE_RUC", "[RUC]"),
    responsibleAddress: v("PRIVACY_RESPONSIBLE_ADDRESS", "[DIRECCIÓN]"),
    privacyEmail: v("PRIVACY_EMAIL", "[CORREO DE PRIVACIDAD]"),
    privacyPhone: v("PRIVACY_PHONE", "[TELÉFONO]"),
    dataProtectionOfficer: v("PRIVACY_DPO", "") /* opcional: se oculta si está vacío */,
    recipientLegalName: v("PRIVACY_RECIPIENT_LEGAL_NAME", "[RAZÓN SOCIAL EXACTA DE AIG EN ECUADOR]"),
    organizationName: v("ORGANIZATION_NAME", "Agrupación Marista Ecuatoriana"),
    supportContact: v("SUPPORT_CONTACT", "[CONTACTO DE SOPORTE]"),
    retentionPeriod: `${retention.months} meses`,
    retention,
    privacyNoticeVersion: v("PRIVACY_NOTICE_VERSION", "1.0"),
    privacyNoticeEffectiveDate: v("PRIVACY_NOTICE_EFFECTIVE_DATE", "[FECHA DE VIGENCIA DEL AVISO]"),
  };
}

export type PrivacyConfig = ReturnType<typeof getPrivacyConfig>;

/** Campos que deben estar completos antes de producción. */
export const REQUIRED_PRIVACY_FIELDS: (keyof PrivacyConfig)[] = [
  "responsibleLegalName",
  "responsibleRuc",
  "responsibleAddress",
  "privacyEmail",
  "privacyPhone",
  "recipientLegalName",
  "supportContact",
  "privacyNoticeEffectiveDate",
];
