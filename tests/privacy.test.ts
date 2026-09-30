import { afterEach, describe, expect, it } from "vitest";
import { getPrivacyConfig } from "@/config/privacy";
import { hasPlaceholder } from "@/lib/privacy/placeholders";
import { checkLegalReadiness } from "@/lib/privacy/readiness";
import { DEFAULT_NOTICE_TEMPLATE, renderConsentTexts, renderTemplate } from "@/lib/privacy/notice";
import { confirmationEmail } from "@/lib/services/email";

const LEGAL_ENV = {
  PRIVACY_RESPONSIBLE_LEGAL_NAME: "Responsable S.A.",
  PRIVACY_RESPONSIBLE_RUC: "1790000000001",
  PRIVACY_RESPONSIBLE_ADDRESS: "Quito",
  PRIVACY_EMAIL: "privacidad@test.ec",
  PRIVACY_PHONE: "+593 2 000 0000",
  PRIVACY_RECIPIENT_LEGAL_NAME: "Aseguradora S.A.",
  SUPPORT_CONTACT: "soporte@test.ec",
  PRIVACY_NOTICE_EFFECTIVE_DATE: "2026-10-01",
  DATA_RETENTION_POLICY: JSON.stringify({ months: 60, reason: "Plazo contractual de la póliza", expiresAt: "" }),
};

afterEach(() => {
  for (const k of [...Object.keys(LEGAL_ENV), "LEGAL_REVIEW_APPROVED", "APP_STAGE"]) delete process.env[k];
});

describe("aviso de privacidad y placeholders", () => {
  it("detecta placeholders sin completar", () => {
    expect(hasPlaceholder("Tratados por [NOMBRE DEL RESPONSABLE]")).toBe(true);
    expect(hasPlaceholder("Tratados por {{responsibleLegalName}}")).toBe(true);
    expect(hasPlaceholder("Tratados por Responsable S.A. [1]")).toBe(false);
  });

  it("bloquea el portal en producción si faltan datos legales", () => {
    process.env.APP_STAGE = "production";
    const config = getPrivacyConfig();
    const r = checkLegalReadiness(config, renderTemplate(DEFAULT_NOTICE_TEMPLATE, config));
    expect(r.blockPortal).toBe(true);
    expect(r.placeholders.length).toBeGreaterThan(0);
  });

  it("bloquea en producción aunque los datos estén completos si no hay aprobación legal", () => {
    Object.assign(process.env, LEGAL_ENV, { APP_STAGE: "production" });
    const config = getPrivacyConfig();
    const r = checkLegalReadiness(config, renderTemplate(DEFAULT_NOTICE_TEMPLATE, config));
    expect(r.placeholders).toEqual([]);
    expect(r.blockPortal).toBe(true);
  });

  it("habilita producción con datos completos y aprobación legal", () => {
    Object.assign(process.env, LEGAL_ENV, { APP_STAGE: "production", LEGAL_REVIEW_APPROVED: "true" });
    const config = getPrivacyConfig();
    const text = renderTemplate(DEFAULT_NOTICE_TEMPLATE, config) + Object.values(renderConsentTexts(config)).join(" ");
    const r = checkLegalReadiness(config, text);
    expect(r).toMatchObject({ ready: true, blockPortal: false });
    expect(text).toContain("Responsable S.A.");
    expect(text).toContain("Registro Oficial No. 459");
  });

  it("en preview no bloquea (muestra banner de prueba)", () => {
    const config = getPrivacyConfig();
    expect(checkLegalReadiness(config, "").blockPortal).toBe(false);
  });

  it("el correo de confirmación no contiene datos sensibles", () => {
    const mail = confirmationEmail("AIG-ABCDEFGH", "soporte@test.ec");
    expect(mail.subject).toBe("Confirmación de actualización de información");
    expect(mail.text).toContain("AIG-ABCDEFGH");
    expect(mail.text).not.toMatch(/\d{10}/);
  });
});
