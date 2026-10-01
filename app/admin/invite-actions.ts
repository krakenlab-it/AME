"use server";

import { getRepo } from "@/lib/database";
import { isDemoMode } from "@/lib/demo-mode";
import { ForbiddenError, type AdminRole } from "@/lib/security/rbac";
import { adminForAction } from "@/lib/server/admin-guard";
import { staffAuthFromSupabase } from "@/lib/services/staff-auth-admin";
import { inviteStaffMember } from "@/lib/services/staff-invite";
import { settings } from "@/lib/services/settings";
import { createServiceRoleClient } from "@/lib/supabase/service";

const DENIED = "No tienes permiso para invitar personal o tu sesión venció.";
const DEMO_ERROR = "En el modo de demostración no se envían invitaciones reales.";
const CONFIG_ERROR = "El acceso administrativo no está configurado.";

export interface InviteStaffState {
  error?: string;
  ok?: boolean;
  emailed?: boolean;
  confirmUrl?: string | null;
  email?: string;
  role?: AdminRole;
}

export async function inviteStaffAction(_prev: InviteStaffState, formData: FormData): Promise<InviteStaffState> {
  const ctx = await adminForAction("staff:invite");
  if (!ctx) return { error: DENIED };
  if (isDemoMode()) return { error: DEMO_ERROR };

  const db = createServiceRoleClient();
  if (!db) return { error: CONFIG_ERROR };
  const repo = getRepo();

  try {
    const result = await inviteStaffMember(
      {
        findByEmail: async (email) => {
          const row = await repo.findAdminByEmail(email);
          return row ? { id: row.id, auth_user_id: row.auth_user_id } : null;
        },
        link: async (row) => {
          if (row.existingId) {
            await repo.updateAdmin(row.existingId, {
              full_name: row.full_name,
              role: row.role,
              auth_user_id: row.auth_user_id,
              active: true,
            });
            return;
          }
          await repo.createAdmin({
            email: row.email,
            full_name: row.full_name,
            role: row.role,
            auth_user_id: row.auth_user_id,
          });
        },
      },
      staffAuthFromSupabase(db),
      ctx.admin.role,
      {
        email: String(formData.get("email") ?? ""),
        fullName: String(formData.get("full_name") ?? ""),
        role: String(formData.get("role") ?? ""),
      },
      settings.baseUrl(),
    );
    if (!result.ok) return { error: result.error };
    return { ok: true, emailed: result.emailed, confirmUrl: result.confirmUrl, email: result.email, role: result.role };
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: DENIED };
    console.error("[invite] no se pudo invitar personal");
    return { error: "No se pudo crear la invitación. Intenta de nuevo." };
  }
}
