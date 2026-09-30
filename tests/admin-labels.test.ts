import { describe, expect, it } from "vitest";
import { actorLabel, AUDIT_ACTIONS, AUDIT_LABELS, auditLabel, isAuditAction, ROLE_LABELS } from "@/lib/admin/labels";

describe("etiquetas del panel administrativo", () => {
  it("cada evento de auditoría tiene un texto legible en español", () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(10);
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_LABELS[action].trim().length).toBeGreaterThan(3);
      expect(AUDIT_LABELS[action]).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("isAuditAction solo acepta eventos conocidos (filtro de la URL)", () => {
    expect(isAuditAction("FORM_SUBMITTED")).toBe(true);
    expect(isAuditAction("DROP_TABLE")).toBe(false);
    expect(isAuditAction("toString")).toBe(false);
    expect(isAuditAction(undefined)).toBe(false);
  });

  it("auditLabel y actorLabel caen al valor original si no lo conocen", () => {
    expect(auditLabel("FORM_SUBMITTED")).toBe(AUDIT_LABELS.FORM_SUBMITTED);
    expect(auditLabel("EVENTO_FUTURO")).toBe("EVENTO_FUTURO");
    expect(actorLabel("respondent")).toBe("Titular");
    expect(actorLabel("otro")).toBe("otro");
  });

  it("los tres roles tienen nombre", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(["ADMIN", "EXPORTER", "REVIEWER"]);
  });
});
