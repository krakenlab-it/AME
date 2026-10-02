import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { DEMO_ADMIN_MFA_BYPASS_CODE, isDemoAdminMfaBypass } from "@/lib/demo/admin-sandbox";
import { createDemoAdmin, getDemoAdminContext, loginWithPassword, verifyMfa } from "@/lib/services/demo-admin-auth";

vi.mock("server-only", () => ({}));

describe("sandbox administrador", () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
    delete process.env.PORTAL_PREVIEW_SANDBOX_BUILD;
  });

  it("acepta el código fijo de demostración en MFA", async () => {
    process.env.DEMO_MODE = "true";
    const repo = new MemoryRepo();
    const admin = await createDemoAdmin(repo, {
      email: "admin@demo.local",
      full_name: "Demo",
      role: "ADMIN",
      password: "Demo-portal-2026",
      totpSecret: "JBSWY3DPEHPK3PXP",
    });
    const login = await loginWithPassword(repo, "admin@demo.local", "Demo-portal-2026", "ip");
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    const ctx = await getDemoAdminContext(repo, login.sessionToken, { requireMfa: false });
    expect(ctx).not.toBeNull();
    expect(isDemoAdminMfaBypass(DEMO_ADMIN_MFA_BYPASS_CODE)).toBe(true);
    const verified = await verifyMfa(repo, ctx!, DEMO_ADMIN_MFA_BYPASS_CODE, "ip");
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const panel = await getDemoAdminContext(repo, verified.sessionToken, { requireMfa: true });
    expect(panel?.admin.id).toBe(admin.id);
  });
});
