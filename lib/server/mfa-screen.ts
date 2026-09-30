import "server-only";
import QRCode from "qrcode";
import { getRepo } from "@/lib/database";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { ADMIN_COOKIE } from "@/lib/security/cookies";
import { cookies } from "next/headers";
import { otpauthUrl } from "@/lib/security/totp";
import { beginTotpEnrollment } from "@/lib/services/admin-auth";
import { ensureMfaSecret, getDemoAdminContext } from "@/lib/services/demo-admin-auth";
import { readAdminGate, signOutAndClear } from "./admin-guard";

export type MfaScreen =
  | { redirectTo: "/admin" | "/admin/login" }
  | { mode: "verify" }
  | { mode: "enroll"; qr: string; secret: string; factorId: string }
  | { mode: "error"; message: string };

/** Pantalla de TOTP. En producción el secreto sale de Supabase Auth; en demo, de la memoria. */
export async function getMfaScreen(): Promise<MfaScreen> {
  const gate = await readAdminGate();
  switch (gate.kind) {
    case "anonymous":
    case "unlinked":
      if (gate.kind === "unlinked") await signOutAndClear();
      return { redirectTo: "/admin/login" };
    case "panel":
      return { redirectTo: "/admin" };
    case "mfa_verify":
      return { mode: "verify" };
    case "mfa_enroll":
      return enrollScreen();
    default: {
      const unreachable: never = gate;
      return unreachable;
    }
  }
}

async function enrollScreen(): Promise<MfaScreen> {
  if (isDemoMode()) {
    const repo = getRepo();
    if (!(repo instanceof MemoryRepo)) return { mode: "error", message: "El modo demostración no está disponible." };
    const ctx = await getDemoAdminContext(repo, (await cookies()).get(ADMIN_COOKIE())?.value, { requireMfa: false });
    if (!ctx) return { redirectTo: "/admin/login" };
    try {
      const secret = await ensureMfaSecret(repo, ctx.admin);
      const qr = await QRCode.toDataURL(otpauthUrl(secret, ctx.admin.email, "Portal AME"), { margin: 1, width: 220 });
      return { mode: "enroll", qr, secret, factorId: "" };
    } catch {
      return { mode: "error", message: "No se pudo preparar la verificación en dos pasos." };
    }
  }
  try {
    const enrolled = await beginTotpEnrollment();
    return { mode: "enroll", ...enrolled };
  } catch {
    return { mode: "error", message: "No se pudo preparar la verificación en dos pasos. Vuelve a intentar." };
  }
}
