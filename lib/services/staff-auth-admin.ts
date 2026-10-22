import type { SupabaseClient } from "@supabase/supabase-js";
import type { BootstrapAuth } from "./admin-bootstrap";
import type { StaffAuthAdmin } from "./staff-invite";

/** Adaptador de Auth admin. Lo usan el panel y el script; no envía la clave al navegador. */
export function staffAuthFromSupabase(db: SupabaseClient): StaffAuthAdmin & BootstrapAuth {
  return {
    async inviteByEmail(email, redirectTo, fullName) {
      const invited = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: fullName },
      });
      const userId = invited.data.user?.id ?? null;
      return { userId, failed: Boolean(invited.error) || !userId };
    },
    async generateRecoveryLink(email, redirectTo) {
      const recovery = await db.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      const userId = recovery.data?.user?.id ?? null;
      return {
        userId,
        hashedToken: recovery.data?.properties?.hashed_token ?? null,
        actionLink: recovery.data?.properties?.action_link ?? null,
        failed: Boolean(recovery.error) || !userId,
      };
    },
    async findAuthUserId(email) {
      const { data, error } = await db.rpc("admin_bootstrap_auth_user_id", { p_email: email });
      const userId = typeof data === "string" && data ? data : null;
      return { userId, failed: Boolean(error) || !userId };
    },
    async sendRecoveryEmail(email, redirectTo) {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      return { failed: Boolean(error) };
    },
  };
}
