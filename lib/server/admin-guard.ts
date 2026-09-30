import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import type { AdminUserRecord } from "@/lib/database/types";
import { isDemoMode } from "@/lib/demo-mode";
import { ADMIN_COOKIE, cookieOptions } from "@/lib/security/cookies";
import { can, type Permission } from "@/lib/security/rbac";
import { gateForAuthUser, type AdminGate } from "@/lib/services/admin-gate";
import { readAuthSnapshot, signOutAdmin } from "@/lib/services/admin-auth";
import { getDemoAdminContext, logoutDemo } from "@/lib/services/demo-admin-auth";

async function readDemoToken() {
  return (await cookies()).get(ADMIN_COOKIE())?.value;
}

export async function readAdminGate(): Promise<AdminGate> {
  if (isDemoMode()) {
    const repo = getRepo();
    if (!isMemoryRepo(repo)) return { kind: "anonymous" };
    const ctx = await getDemoAdminContext(repo, await readDemoToken(), { requireMfa: false });
    if (!ctx) return { kind: "anonymous" };
    if (ctx.session.mfaVerified) return { kind: "panel", admin: ctx.admin };
    if (!ctx.admin.mfa_enabled) return { kind: "mfa_enroll", admin: ctx.admin };
    return { kind: "mfa_verify", admin: ctx.admin };
  }
  return gateForAuthUser(getRepo(), await readAuthSnapshot());
}

async function endSession(): Promise<void> {
  if (isDemoMode()) {
    const repo = getRepo();
    if (isMemoryRepo(repo)) await logoutDemo(repo, await readDemoToken());
    (await cookies()).set(ADMIN_COOKIE(), "", cookieOptions(0));
    return;
  }
  await signOutAdmin(getRepo());
  (await cookies()).set(ADMIN_COOKIE(), "", cookieOptions(0));
}

export async function requireAdmin(permission?: Permission): Promise<{ admin: AdminUserRecord }> {
  const gate = await readAdminGate();
  switch (gate.kind) {
    case "panel":
      if (permission && !can(gate.admin.role, permission)) redirect("/admin?denegado=1");
      return { admin: gate.admin };
    case "mfa_enroll":
    case "mfa_verify":
      redirect("/admin/mfa");
    case "unlinked":
      await endSession();
      redirect("/admin/login");
    case "anonymous":
      redirect("/admin/login");
    default: {
      const unreachable: never = gate;
      return unreachable;
    }
  }
}

export async function adminForAction(permission?: Permission): Promise<{ admin: AdminUserRecord } | null> {
  const gate = await readAdminGate();
  if (gate.kind !== "panel") return null;
  if (permission && !can(gate.admin.role, permission)) return null;
  return { admin: gate.admin };
}

export async function signOutAndClear(): Promise<void> {
  await endSession();
}
