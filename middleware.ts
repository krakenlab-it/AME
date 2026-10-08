import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo-mode";
import { classifyAdminPath, middlewareGate, redirectForAdminRoute } from "@/lib/services/admin-gate";
import { refreshAdminAuth } from "@/lib/supabase/middleware";

/**
 * - Content-Security-Policy con nonce por petición (sin 'unsafe-inline' para scripts).
 * - Sin trackers: solo recursos propios (+ Cloudflare Turnstile para el CAPTCHA adaptativo).
 * - /admin exige sesión de Supabase Auth. El panel (fuera de MFA y de elegir contraseña) exige AAL2.
 * - /verificar no se toca: sigue con el enlace individual.
 * - Cache-Control: no-store en páginas con datos personales.
 */
export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    process.env.VERCEL_ENV || process.env.APP_STAGE === "production" ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");

  const path = req.nextUrl.pathname;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const area = classifyAdminPath(path);
  let response: NextResponse;
  if (!area) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else if (isDemoMode()) {
    const hasSession = req.cookies.has("__Host-ame_adm") || req.cookies.has("ame_adm");
    if ((area === "panel" || area === "session") && !hasSession) {
      response = NextResponse.redirect(new URL("/admin/login", req.url));
    } else {
      response = NextResponse.next({ request: { headers: requestHeaders } });
    }
  } else {
    const session = await refreshAdminAuth(req, requestHeaders);
    const dest = redirectForAdminRoute(path, middlewareGate(session.userId, session.aal));
    if (dest) {
      response = NextResponse.redirect(new URL(dest, req.url));
      session.apply(response);
    } else {
      response = session.response;
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  if (path.startsWith("/verificar") || path.startsWith("/ingresar") || path.startsWith("/confirmacion") || path.startsWith("/admin") || path.startsWith("/mi-cuenta")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|logos/|templates/).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
