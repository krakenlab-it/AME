import type { AdminGateKind } from "@/lib/services/admin-gate";

/** Consola a la que vuelve quien ya tiene sesión. null = la portada se queda. */
export type LandingConsolePath = "/admin" | "/admin/mfa" | "/mi-cuenta";

/**
 * Decide el destino de `/` con la misma barrera del panel (`admin_users` + MFA)
 * y la sesión del asegurado. No redirige login, registro, MFA, confirmación ni
 * `/verificar`: esas rutas siguen en su propio guardia.
 * Si conviven las dos sesiones, gana la de administración para no dejar al personal en Mi cuenta.
 */
export function landingConsolePath(input: {
  admin: AdminGateKind;
  hasRespondentSession: boolean;
}): LandingConsolePath | null {
  switch (input.admin) {
    case "panel":
      return "/admin";
    case "mfa_enroll":
    case "mfa_verify":
      return "/admin/mfa";
    case "anonymous":
    case "unlinked":
      return input.hasRespondentSession ? "/mi-cuenta" : null;
    default: {
      const unreachable: never = input.admin;
      return unreachable;
    }
  }
}
