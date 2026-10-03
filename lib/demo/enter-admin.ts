import type { MemoryRepo } from "@/lib/database/memory-repo";
import { DEMO_ADMIN_CREDENTIALS } from "@/lib/demo/admin-sandbox";
import { issueStatelessDemoAdminSession, statelessDemoAdminSessionEnabled } from "@/lib/demo/stateless-admin-session";
import { startDemoSession } from "@/lib/services/demo-admin-auth";

/** Sesión administrativa de demostración con MFA ya verificado. */
export async function mintDemoAdminSessionToken(repo: MemoryRepo): Promise<string | null> {
  const admin = await repo.findAdminByEmail(DEMO_ADMIN_CREDENTIALS.email);
  if (!admin) return null;
  if (statelessDemoAdminSessionEnabled()) return issueStatelessDemoAdminSession(admin.email, true);
  return startDemoSession(repo, admin);
}
