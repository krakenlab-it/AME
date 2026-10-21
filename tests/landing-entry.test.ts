import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import * as respondent from "@/lib/services/respondent";
import * as schemas from "@/lib/validation/schemas";
import { landingConsolePath } from "@/lib/services/landing-redirect";

describe("entrada pública", () => {
  it("/ingreso redirige (temporal) a /ingresar", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/ingreso", destination: "/ingresar", permanent: false });
  });

  it("ya no existe el ingreso solo con cédula desde la portada", () => {
    expect(existsSync(path.resolve(__dirname, "../components/forms/cedula-cta.tsx"))).toBe(false);
    expect("resumeImportedPersonByCedula" in respondent).toBe(false);
    expect("cedulaResumeSchema" in schemas).toBe(false);
  });

  it("/ingresar envía al panel solo a quien pasa la barrera de administración", () => {
    expect(landingConsolePath({ admin: "panel", hasRespondentSession: false })).toBe("/admin");
    expect(landingConsolePath({ admin: "mfa_verify", hasRespondentSession: false })).toBe("/admin/mfa");
    expect(landingConsolePath({ admin: "unlinked", hasRespondentSession: false })).toBeNull();
    expect(landingConsolePath({ admin: "anonymous", hasRespondentSession: false })).toBeNull();
  });
});
