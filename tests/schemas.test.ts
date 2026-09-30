import { describe, expect, it } from "vitest";
import { bankSchema, consentSchema, contactSchema, submissionSchema } from "@/lib/validation/schemas";
import { normalizePhone } from "@/lib/validation/phone";
import { sanitizeDeep } from "@/lib/validation/sanitize";
import { validSubmission } from "./helpers/fixtures";

describe("validaciones del formulario", () => {
  it("acepta un envío completo y válido", () => {
    expect(submissionSchema.safeParse(validSubmission()).success).toBe(true);
  });

  it("rechaza correos que no coinciden", () => {
    const c = { ...validSubmission().contact, primaryEmailConfirm: "otro@correo.com" };
    const r = contactSchema.safeParse(c);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.join(".") === "primaryEmailConfirm")).toBe(true);
  });

  it("rechaza números de cuenta que no coinciden", () => {
    const b = { ...validSubmission().bank, accountNumberConfirm: "2200001111" };
    const r = bankSchema.safeParse(b);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["accountNumberConfirm"]);
  });

  it("exige los campos obligatorios", () => {
    const c = { ...validSubmission().contact, addressLine1: "", city: "" };
    const r = contactSchema.safeParse(c);
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toContain("addressLine1");
    expect(paths).toContain("city");
  });

  it("exige el nombre de la institución cuando el banco es 'Otro'", () => {
    const r = bankSchema.safeParse({ ...validSubmission().bank, bankName: "Otro", bankOtherName: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza el envío si falta cualquier consentimiento obligatorio", () => {
    for (const key of ["privacyAccepted", "sharingAccepted", "accuracyDeclared"] as const) {
      const consents = { privacyAccepted: true, sharingAccepted: true, accuracyDeclared: true, [key]: false };
      expect(consentSchema.safeParse(consents).success).toBe(false);
    }
  });

  it("rechaza campos adicionales (mass assignment)", () => {
    const payload = { ...validSubmission(), status: "COMPLETED", person_id: "otra-persona" };
    expect(submissionSchema.safeParse(payload).success).toBe(false);
  });

  it("recorta espacios y elimina caracteres de control", () => {
    const clean = sanitizeDeep({ a: "  Juan\u0000  Carlos  ", nested: { b: "\u200Bx " } });
    expect(clean).toEqual({ a: "Juan Carlos", nested: { b: "x" } });
  });

  it("rechaza marcado HTML en direcciones", () => {
    const c = { ...validSubmission().contact, addressLine1: "<script>alert(1)</script>" };
    expect(contactSchema.safeParse(c).success).toBe(false);
  });

  it("valida teléfonos en formato internacional", () => {
    expect(normalizePhone("+593", "099 123 4567")).toEqual({ ok: true, e164: "+593991234567" });
    expect(normalizePhone("+593", "02 234 5678").ok).toBe(false); // fijo, no celular
    expect(normalizePhone("+1", "305 555 0100")).toEqual({ ok: true, e164: "+13055550100" });
    expect(normalizePhone("593", "0991234567").ok).toBe(false);
  });
});
