import { NextResponse, type NextRequest } from "next/server";

/**
 * - Content-Security-Policy con nonce por petición (sin 'unsafe-inline' para scripts).
 * - Sin trackers: solo recursos propios (+ Cloudflare Turnstile para el CAPTCHA adaptativo).
 * - Barrera temprana para /admin (la validación real de la sesión ocurre en el servidor).
 * - Cache-Control: no-store en páginas con datos personales.
 */
export function middleware(req: NextRequest) {
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
  if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
    const hasSession = req.cookies.has("__Host-ame_adm") || req.cookies.has("ame_adm");
    if (!hasSession) return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  if (path.startsWith("/verificar") || path.startsWith("/confirmacion") || path.startsWith("/admin")) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|logos/|templates/).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
