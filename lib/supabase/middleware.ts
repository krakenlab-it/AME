import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { AssuranceLevel } from "@/lib/services/admin-gate";
import { authCookieOptions } from "./auth-cookies";
import { supabasePublicConfig } from "./public-env";

export interface RefreshedAuth {
  response: NextResponse;
  userId: string | null;
  aal: AssuranceLevel | null;
  apply: (response: NextResponse) => void;
}

/**
 * Refresca la sesión de Supabase Auth y verifica el JWT con getClaims().
 * Solo se llama en rutas /admin. /verificar no pasa por aquí.
 */
export async function refreshAdminAuth(request: NextRequest, requestHeaders: Headers): Promise<RefreshedAuth> {
  let pending: { name: string; value: string; options: CookieOptions }[] = [];
  const apply = (target: NextResponse) => {
    for (const cookie of pending) target.cookies.set(cookie.name, cookie.value, cookie.options);
  };
  const forward = () => {
    const cookieHeader = request.cookies.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    if (cookieHeader) requestHeaders.set("cookie", cookieHeader);
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    apply(next);
    return next;
  };

  let response = forward();
  const cfg = supabasePublicConfig();
  if (!cfg) return { response, userId: null, aal: null, apply };

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookieOptions: authCookieOptions(),
    auth: { flowType: "pkce" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pending = cookiesToSet;
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = forward();
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return { response, userId: null, aal: null, apply };
  const aal: AssuranceLevel = data.claims.aal === "aal2" ? "aal2" : "aal1";
  return { response, userId: data.claims.sub, aal, apply };
}
