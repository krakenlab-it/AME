import { describe, expect, it } from "vitest";
import { landingConsolePath } from "@/lib/services/landing-redirect";

describe("portada con sesión ya abierta", () => {
  it("deja la portada si no hay sesión de administración ni del asegurado", () => {
    expect(landingConsolePath({ admin: "anonymous", hasRespondentSession: false })).toBeNull();
    expect(landingConsolePath({ admin: "unlinked", hasRespondentSession: false })).toBeNull();
  });

  it("abre el panel si la sesión de administración ya pasó el segundo factor", () => {
    expect(landingConsolePath({ admin: "panel", hasRespondentSession: false })).toBe("/admin");
    expect(landingConsolePath({ admin: "panel", hasRespondentSession: true })).toBe("/admin");
  });

  it("abre el segundo factor si la sesión de administración todavía no es AAL2", () => {
    expect(landingConsolePath({ admin: "mfa_enroll", hasRespondentSession: false })).toBe("/admin/mfa");
    expect(landingConsolePath({ admin: "mfa_verify", hasRespondentSession: true })).toBe("/admin/mfa");
  });

  it("abre mi cuenta solo cuando la sesión es del asegurado", () => {
    expect(landingConsolePath({ admin: "anonymous", hasRespondentSession: true })).toBe("/mi-cuenta");
    expect(landingConsolePath({ admin: "unlinked", hasRespondentSession: true })).toBe("/mi-cuenta");
  });
});
