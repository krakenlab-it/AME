import type { PrivacyConfig } from "@/config/privacy";

/**
 * ⚠️ LEGAL_REVIEW_REQUIRED
 * Texto inicial del Aviso de Privacidad (entregado por el cliente). Puede reemplazarse
 * desde /admin/aviso, que publica una nueva versión en la tabla privacy_notices.
 * Variables disponibles: {{responsibleLegalName}}, {{recipientLegalName}}, etc.
 */
export const LEGAL_REVIEW_REQUIRED = true;

export const DEFAULT_NOTICE_TEMPLATE = `PROTECCIÓN DE SUS DATOS PERSONALES

La información proporcionada a través de este portal será tratada de manera confidencial y de conformidad con la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP), publicada en el Quinto Suplemento del Registro Oficial No. 459, de 26 de mayo de 2021, su Reglamento General, expedido mediante Decreto Ejecutivo No. 904, y demás normativa aplicable.

Los datos proporcionados serán tratados por {{responsibleLegalName}} y comunicados a {{recipientLegalName}} (AIG) únicamente cuando sea necesario para gestionar los procesos relacionados con presentación, administración y seguimiento de reclamos, validación de documentación y procesamiento o pago de reembolsos.

No utilizaremos la información proporcionada mediante este formulario para fines comerciales o publicitarios ajenos a las finalidades antes indicadas.

Se aplicarán medidas técnicas y organizativas razonables destinadas a preservar la confidencialidad, integridad y disponibilidad de la información.

Plazo de conservación: {{retentionPeriod}}. Motivo: {{retentionReason}}. Una vez cumplida la finalidad y los plazos legales o contractuales aplicables, los datos serán bloqueados, eliminados o anonimizados, según corresponda.`;

export const CONSENT_TEXTS = {
  PRIVACY_NOTICE:
    "He leído y comprendido el Aviso de Privacidad y autorizo el tratamiento de los datos personales proporcionados mediante este formulario para las finalidades aquí descritas.",
  DATA_SHARING_AIG:
    "Autorizo expresamente que {{responsibleLegalName}} comunique los datos proporcionados a AIG para la presentación, gestión, seguimiento y resolución de reclamos, así como para la validación y procesamiento de pagos y reembolsos relacionados con dichos reclamos.",
  ACCURACY_DECLARATION:
    "Declaro que la información proporcionada es correcta, completa y actualizada según mi leal saber y entender.",
  BANK_ACCOUNT_AUTHORIZATION:
    "La cuenta bancaria ingresada pertenece al beneficiario indicado o estoy autorizado para proporcionar esta información.",
} as const;

export type ConsentType = keyof typeof CONSENT_TEXTS;

export const CONSENT_PURPOSE =
  "Presentación, gestión, seguimiento y resolución de reclamos; validación de documentación; procesamiento y pago de reembolsos relacionados con AIG.";

export function renderTemplate(template: string, config: PrivacyConfig): string {
  const values: Record<string, string> = {
    responsibleLegalName: config.responsibleLegalName,
    responsibleRuc: config.responsibleRuc,
    responsibleAddress: config.responsibleAddress,
    privacyEmail: config.privacyEmail,
    privacyPhone: config.privacyPhone,
    dataProtectionOfficer: config.dataProtectionOfficer,
    recipientLegalName: config.recipientLegalName,
    retentionPeriod: config.retentionPeriod,
    retentionReason: config.retention.reason,
    organizationName: config.organizationName,
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export function renderConsentTexts(config: PrivacyConfig): Record<ConsentType, string> {
  return Object.fromEntries(
    Object.entries(CONSENT_TEXTS).map(([k, t]) => [k, renderTemplate(t, config)]),
  ) as Record<ConsentType, string>;
}
