import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente con service_role. Solo en el servidor, después de comprobar la sesión. */
export function createServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-application-name": "portal-actualizacion-ame" } },
  });
}
