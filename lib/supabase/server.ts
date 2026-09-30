import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions } from "./auth-cookies";
import { supabasePublicConfig } from "./public-env";

/** Cliente de Auth con cookies. No usa service_role y no lee tablas de PII. */
export async function createAuthClient() {
  const cfg = supabasePublicConfig();
  if (!cfg) return null;
  const cookieStore = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookieOptions: authCookieOptions(),
    auth: { flowType: "pkce" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // En un Server Component no se pueden escribir cookies.
          // El middleware refresca la sesión en cada petición a /admin.
        }
      },
    },
  });
}
