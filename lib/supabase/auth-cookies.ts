import type { CookieOptions } from "@supabase/ssr";
import { deployStage } from "@/lib/privacy/readiness";

/**
 * Cookies de Supabase Auth.
 * SameSite=Lax (no Strict): el enlace de invitación o de restablecimiento
 * se abre desde el correo y el navegador tiene que enviar la cookie del flujo PKCE.
 * HttpOnly para que el JavaScript de la página no lea la sesión.
 */
export function authCookieOptions(): CookieOptions {
  const secure = deployStage() !== "development" || process.env.FORCE_SECURE_COOKIES === "true";
  return { path: "/", sameSite: "lax", secure, httpOnly: true };
}
