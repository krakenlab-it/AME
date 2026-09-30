"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_COOKIE, cookieOptions } from "@/lib/security/cookies";
import { ipHash } from "@/lib/security/request";
import { getAdminContext, loginWithPassword, logout, verifyMfa } from "@/lib/services/admin-auth";
import { readAdminToken } from "@/lib/server/admin-guard";

export interface AuthState {
  error?: string;
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password || password.length > 256) return { error: "Ingresa tu correo y contraseña." };
  let token: string;
  try {
    const res = await loginWithPassword(getRepo(), email, password, ipHash(await headers()));
    if (!res.ok) return { error: res.error };
    token = res.sessionToken;
  } catch {
    return { error: "El servicio no está disponible. Intenta más tarde." };
  }
  (await cookies()).set(ADMIN_COOKIE(), token, cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
  redirect("/admin/mfa");
}

export async function mfaAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const repo = getRepo();
  const ctx = await getAdminContext(repo, await readAdminToken(), { requireMfa: false });
  if (!ctx) redirect("/admin/login");
  let token: string;
  try {
    const res = await verifyMfa(repo, ctx, String(formData.get("code") ?? ""), ipHash(await headers()));
    if (!res.ok) return { error: res.error };
    token = res.sessionToken;
  } catch {
    return { error: "El servicio no está disponible. Intenta más tarde." };
  }
  (await cookies()).set(ADMIN_COOKIE(), token, cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const repo = getRepo();
  const ctx = await getAdminContext(repo, await readAdminToken(), { requireMfa: false });
  await logout(repo, ctx);
  (await cookies()).set(ADMIN_COOKIE(), "", cookieOptions(0));
  redirect("/admin/login");
}
