import "server-only";
import QRCode from "qrcode";
import { cookies } from "next/headers";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { ADMIN_COOKIE } from "@/lib/security/cookies";
import { otpauthUrl } from "@/lib/security/totp";
import { ensureMfaSecret, getDemoAdminContext } from "@/lib/services/demo-admin-auth";
import { readAdminGate } from "./admin-guard";

/** QR de la misma aplicación autenticadora del ingreso (solo demo; en producción se usa la app ya configurada). */
export async function manualEditVerificationQr(): Promise<string | null> {
  if (!isDemoMode()) return null;
  const gate = await readAdminGate();
  if (gate.kind !== "panel") return null;
  const repo = getRepo();
  if (!isMemoryRepo(repo)) return null;
  const ctx = await getDemoAdminContext(repo, (await cookies()).get(ADMIN_COOKIE())?.value);
  if (!ctx) return null;
  const secret = await ensureMfaSecret(repo, ctx.admin);
  return QRCode.toDataURL(otpauthUrl(secret, ctx.admin.email, "Portal AME"), { margin: 1, width: 200 });
}
