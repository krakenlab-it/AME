import "server-only";
import { encrypt, decrypt } from "@/lib/encryption/crypto";
import { isDemoMode } from "@/lib/demo-mode";
import { ADMIN_ABSOLUTE_HOURS } from "@/lib/security/cookies";

const PREFIX = "sdl.";

export interface StatelessDemoAdminPayload {
  adminId: string;
  mfaVerified: boolean;
  exp: number;
}

/** En demo, la sesión va en la cookie (serverless no comparte memoria entre peticiones). */
export function statelessDemoAdminSessionEnabled(): boolean {
  return isDemoMode();
}

export function issueStatelessDemoAdminSession(adminId: string, mfaVerified: boolean): string {
  const exp = Date.now() + ADMIN_ABSOLUTE_HOURS * 3_600_000;
  const payload: StatelessDemoAdminPayload = { adminId, mfaVerified, exp };
  return PREFIX + encrypt(JSON.stringify(payload));
}

export function parseStatelessDemoAdminSession(token: string): StatelessDemoAdminPayload | null {
  if (!token.startsWith(PREFIX)) return null;
  try {
    const data = JSON.parse(decrypt(token.slice(PREFIX.length))) as StatelessDemoAdminPayload;
    if (!data.adminId || typeof data.mfaVerified !== "boolean" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}
