import type { AdminRepo, AdminUserRecord } from "@/lib/database/types";

/** Nivel de autenticación de Supabase Auth. El panel exige aal2 (contraseña + TOTP). */
export type AssuranceLevel = "aal1" | "aal2";

export type AdminGateKind = "anonymous" | "unlinked" | "mfa_enroll" | "mfa_verify" | "panel";

export interface AuthSnapshot {
  userId: string | null;
  currentLevel: AssuranceLevel | null;
  nextLevel: AssuranceLevel | null;
}

export type AdminGate =
  | { kind: "anonymous" }
  | { kind: "unlinked" }
  | { kind: "mfa_enroll"; admin: AdminUserRecord }
  | { kind: "mfa_verify"; admin: AdminUserRecord }
  | { kind: "panel"; admin: AdminUserRecord };

/**
 * Decide si la sesión puede entrar al panel.
 * El perfil tiene que estar vinculado por auth_user_id y activo.
 * aal2/aal2 es el único estado que abre el panel: sin TOTP verificado no hay acceso.
 */
export function decideAdminGate(input: AuthSnapshot & { admin: { active: boolean; auth_user_id: string | null } | null }): AdminGateKind {
  const { userId, currentLevel, nextLevel, admin } = input;
  if (!userId) return "anonymous";
  if (!admin || !admin.active || !admin.auth_user_id || admin.auth_user_id !== userId) return "unlinked";
  if (currentLevel === "aal2" && nextLevel === "aal2") return "panel";
  if (nextLevel === "aal2") return "mfa_verify";
  return "mfa_enroll";
}

/** Lo que el middleware puede saber sin consultar admin_users (eso lo confirma el servidor). */
export function middlewareGate(userId: string | null, aal: AssuranceLevel | null): AdminGateKind {
  if (!userId) return "anonymous";
  return aal === "aal2" ? "panel" : "mfa_verify";
}

export async function gateForAuthUser(repo: Pick<AdminRepo, "findAdminByAuthUserId">, auth: AuthSnapshot): Promise<AdminGate> {
  if (!auth.userId) return { kind: "anonymous" };
  const admin = await repo.findAdminByAuthUserId(auth.userId);
  const kind = decideAdminGate({ ...auth, admin });
  switch (kind) {
    case "anonymous":
      return { kind: "anonymous" };
    case "unlinked":
      return { kind: "unlinked" };
    case "mfa_enroll":
    case "mfa_verify":
    case "panel":
      if (!admin) return { kind: "unlinked" };
      return { kind, admin };
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export type AdminPathClass = "public" | "session" | "panel";

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** null = no es una ruta de administración (el titular y la portada no cambian). */
export function classifyAdminPath(pathname: string): AdminPathClass | null {
  if (!pathname.startsWith("/admin")) return null;
  if (matches(pathname, "/admin/login") || matches(pathname, "/admin/recuperar") || matches(pathname, "/admin/auth")) return "public";
  if (matches(pathname, "/admin/mfa") || matches(pathname, "/admin/registro") || matches(pathname, "/admin/restablecer")) return "session";
  return "panel";
}

export function redirectForAdminRoute(pathname: string, gate: AdminGateKind): string | null {
  const area = classifyAdminPath(pathname);
  if (area === null) return null;
  if (area === "public") {
    if (gate === "panel") return "/admin";
    if (gate === "mfa_enroll" || gate === "mfa_verify") return "/admin/mfa";
    return null;
  }
  if (gate === "anonymous" || gate === "unlinked") return "/admin/login";
  if (area === "panel" && gate !== "panel") return "/admin/mfa";
  if (matches(pathname, "/admin/mfa") && gate === "panel") return "/admin";
  if ((matches(pathname, "/admin/registro") || matches(pathname, "/admin/restablecer")) && gate === "panel") return "/admin";
  return null;
}

const CONFIRM_DESTINATIONS = new Set(["/admin", "/admin/mfa", "/admin/registro", "/admin/restablecer"]);

/** Evita que un enlace de correo redirija fuera del panel. */
export function safeAdminNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  const path = next.split("?")[0]?.split("#")[0] ?? "";
  return CONFIRM_DESTINATIONS.has(path) ? path : fallback;
}

export function destinationAfterConfirm(type: string | null | undefined, next: string | null | undefined): string {
  const fallback = type === "recovery" ? "/admin/restablecer" : "/admin/registro";
  return safeAdminNext(next, fallback);
}

/** Supabase devuelve el SVG del QR; el teléfono lo muestra como imagen. */
export function totpQrDataUrl(qrCode: string): string {
  const trimmed = qrCode.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(trimmed)}`;
}

export function normalizeAdminEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value || value.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return null;
  return value;
}

export function normalizeTotpCode(code: string): string | null {
  const clean = code.replace(/\s/g, "");
  return /^\d{6}$/.test(clean) ? clean : null;
}
