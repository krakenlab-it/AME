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

/** Valores antiguos del sandbox en Vercel Preview; se sustituyen por los validados. */
const PRIVACY_STALE_PREVIEW_ENV: Record<string, string> = {
  PRIVACY_EMAIL: "privacidad@ame.local",
  PRIVACY_PHONE: "+593 2 000 0000",
  PRIVACY_RESPONSIBLE_RUC: "1790000000001",
  PRIVACY_RECIPIENT_LEGAL_NAME: "AIG Metropolitana",
};

/** Valores validados para sandbox / preview / DEMO_MODE cuando no hay variable de entorno. */
export const PRIVACY_DEMO_FALLBACKS: Record<string, string> = {
  PRIVACY_RESPONSIBLE_LEGAL_NAME: "Agrupación Marista Ecuatoriana",
  PRIVACY_RESPONSIBLE_RUC: "1791758528001",
  PRIVACY_RESPONSIBLE_ADDRESS: "Quito, Ecuador",
  PRIVACY_EMAIL: "amecooradm@fmsnor.org",
  PRIVACY_PHONE: "255-0660",
  PRIVACY_RECIPIENT_LEGAL_NAME: "AIG y Unibrokers",
  SUPPORT_CONTACT: "amecooradm@fmsnor.org",
  PRIVACY_NOTICE_EFFECTIVE_DATE: "2026-09-30",
};

function privacyDemoFallbacksEnabled(): boolean {
  if (process.env.APP_STAGE === "production" || process.env.VERCEL_ENV === "production") return false;
  return true;
}

const v = (name: string, placeholder: string) => {
  const raw = process.env[name]?.trim();
  if (raw) {
    if (
      process.env.VERCEL_ENV === "preview" &&
      PRIVACY_STALE_PREVIEW_ENV[name] === raw &&
      PRIVACY_DEMO_FALLBACKS[name]
    ) {
      return PRIVACY_DEMO_FALLBACKS[name];
    }
    return raw;
  }
  if (privacyDemoFallbacksEnabled() && PRIVACY_DEMO_FALLBACKS[name]) return PRIVACY_DEMO_FALLBACKS[name];
  return placeholder;
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
