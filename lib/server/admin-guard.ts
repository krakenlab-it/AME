import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { ADMIN_COOKIE } from "@/lib/security/cookies";
import { can, type Permission } from "@/lib/security/rbac";
import { getAdminContext, type AdminContext } from "@/lib/services/admin-auth";

export async function readAdminToken() {
  return (await cookies()).get(ADMIN_COOKIE())?.value;
}

/** Para páginas: redirige al login o al panel si falta sesión o permiso. */
export async function requireAdmin(permission?: Permission): Promise<AdminContext> {
  const ctx = await getAdminContext(getRepo(), await readAdminToken());
  if (!ctx) redirect("/admin/login");
  if (permission && !can(ctx.admin.role, permission)) redirect("/admin?denegado=1");
  return ctx;
}

/** Para server actions y rutas API: devuelve null en lugar de redirigir. */
export async function adminForAction(permission?: Permission): Promise<AdminContext | null> {
  const ctx = await getAdminContext(getRepo(), await readAdminToken());
  if (!ctx) return null;
  if (permission && !can(ctx.admin.role, permission)) return null;
  return ctx;
}
