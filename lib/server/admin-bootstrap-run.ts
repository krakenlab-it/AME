import "server-only";
import { getRepo } from "@/lib/database";
import { isDemoMode } from "@/lib/demo-mode";
import { bootstrapAdmins, parseBootstrapEmails, type BootstrapOutcome } from "@/lib/services/admin-bootstrap";
import { settings } from "@/lib/services/settings";
import { staffAuthFromSupabase } from "@/lib/services/staff-auth-admin";
import { createServiceRoleClient } from "@/lib/supabase/service";

const globalRun = globalThis as unknown as { __adminBootstrap?: Promise<BootstrapOutcome[]> };

/** Una vez por instancia del servidor. Solo deja en el registro huellas y estados, nunca correos ni enlaces. */
export function runAdminBootstrap(): Promise<BootstrapOutcome[]> {
  globalRun.__adminBootstrap ??= run();
  return globalRun.__adminBootstrap;
}

async function run(): Promise<BootstrapOutcome[]> {
  const { emails, invalid } = parseBootstrapEmails(process.env.ADMIN_BOOTSTRAP_EMAILS);
  if (invalid > 0) console.error(`[admin-bootstrap] ${invalid} correo(s) ignorado(s) en ADMIN_BOOTSTRAP_EMAILS`);
  if (emails.length === 0) return [];
  if (isDemoMode()) return [];
  const db = createServiceRoleClient();
  if (!db) {
    console.error("[admin-bootstrap] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    return [];
  }
  const repo = getRepo();
  const outcomes = await bootstrapAdmins(
    {
      findByEmail: async (email) => {
        const row = await repo.findAdminByEmail(email);
        return row ? { id: row.id, auth_user_id: row.auth_user_id } : null;
      },
      save: async (row) => {
        if (row.existingId) {
          await repo.updateAdmin(row.existingId, { auth_user_id: row.auth_user_id, role: "ADMIN", active: true, must_change_password: true });
          return;
        }
        await repo.createAdmin({ email: row.email, full_name: "Administrador inicial", role: "ADMIN", auth_user_id: row.auth_user_id, must_change_password: true });
      },
      rateLimitHit: (bucket, limit, windowSeconds) => repo.rateLimitHit(bucket, limit, windowSeconds),
      logSecurityEvent: (e) => repo.logSecurityEvent(e),
    },
    staffAuthFromSupabase(db),
    emails,
    settings.baseUrl(),
  );
  const summary = outcomes.map((o) => `${o.emailHash}:${o.status}`).join(" ");
  console.warn(`[admin-bootstrap] ${summary}`);
  return outcomes;
}
