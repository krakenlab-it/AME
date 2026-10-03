"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { isMemoryRepo } from "@/lib/database/memory-repo";
import { isDemoMode } from "@/lib/demo-mode";
import { ADMIN_ABSOLUTE_HOURS, ADMIN_COOKIE, cookieOptions } from "@/lib/security/cookies";
import { ipHash } from "@/lib/security/request";
import { passwordPolicyError } from "@/lib/security/password";
import {
  adoptAuthSession,
  confirmEmailLink,
  requestPasswordReset,
  RESET_SENT_MESSAGE,
  setAdminPassword,
  signInAdmin,
  UNAVAILABLE_ERROR,
  verifyAdminTotp,
} from "@/lib/services/admin-auth";
import { mintDemoAdminSessionToken } from "@/lib/demo/enter-admin";
import { changeDemoPassword, getDemoAdminContext, loginWithPassword, verifyMfa } from "@/lib/services/demo-admin-auth";
import { signOutAndClear } from "@/lib/server/admin-guard";

export interface AuthState {
  error?: string;
  message?: string;
}

export interface LinkState {
  error?: string;
  next?: string;
}

function serviceError(error: unknown): AuthState {
  if (error && typeof error === "object" && "digest" in error) throw error;
  return { error: UNAVAILABLE_ERROR };
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password || password.length > 256) return { error: "Ingresa tu correo y contraseña." };
  try {
    if (isDemoMode()) {
      const repo = getRepo();
      if (!isMemoryRepo(repo)) return { error: UNAVAILABLE_ERROR };
      const res = await loginWithPassword(repo, email, password, ipHash(await headers()));
      if (!res.ok) return { error: res.error };
      const sessionToken = (await mintDemoAdminSessionToken(repo)) ?? res.sessionToken;
      (await cookies()).set(ADMIN_COOKIE(), sessionToken, cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
      redirect("/admin");
    } else {
      const res = await signInAdmin(getRepo(), email, password, ipHash(await headers()));
      if (!res.ok) return { error: res.error };
    }
  } catch (error) {
    return serviceError(error);
  }
  redirect("/admin/mfa");
}

export async function requestResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  if (isDemoMode()) {
    return { message: "En el modo demostración usa el correo y la contraseña que muestra la consola del servidor." };
  }
  try {
    const res = await requestPasswordReset(getRepo(), String(formData.get("email") ?? ""), ipHash(await headers()));
    if (!res.ok) return { error: res.error };
    return { message: res.message || RESET_SENT_MESSAGE };
  } catch (error) {
    return serviceError(error);
  }
}

export async function setPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  try {
    if (isDemoMode()) {
      const policy = passwordPolicyError(password);
      if (policy) return { error: policy };
      if (password !== confirm) return { error: "Las contraseñas no coinciden." };
      const repo = getRepo();
      if (!isMemoryRepo(repo)) return { error: UNAVAILABLE_ERROR };
      const ctx = await getDemoAdminContext(repo, (await cookies()).get(ADMIN_COOKIE())?.value, { requireMfa: false });
      if (!ctx) redirect("/admin/login");
      await changeDemoPassword(repo, ctx.admin.id, password);
    } else {
      const res = await setAdminPassword(password, confirm);
      if (!res.ok) return { error: res.error };
    }
  } catch (error) {
    return serviceError(error);
  }
  redirect("/admin/mfa");
}

export async function mfaAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const code = String(formData.get("code") ?? "");
  const factorId = String(formData.get("factorId") ?? "");
  try {
    if (isDemoMode()) {
      const repo = getRepo();
      if (!isMemoryRepo(repo)) return { error: UNAVAILABLE_ERROR };
      const ctx = await getDemoAdminContext(repo, (await cookies()).get(ADMIN_COOKIE())?.value, { requireMfa: false });
      if (!ctx) redirect("/admin/login");
      const res = await verifyMfa(repo, ctx, code, ipHash(await headers()));
      if (!res.ok) return { error: res.error };
      (await cookies()).set(ADMIN_COOKIE(), res.sessionToken, cookieOptions(ADMIN_ABSOLUTE_HOURS * 3600));
    } else {
      const res = await verifyAdminTotp(getRepo(), { code, factorId }, ipHash(await headers()));
      if (!res.ok) return { error: res.error };
    }
  } catch (error) {
    return serviceError(error);
  }
  redirect("/admin");
}

export async function confirmLinkAction(input: { tokenHash?: string; type?: string; code?: string; next?: string }): Promise<LinkState> {
  if (isDemoMode()) return { error: "En el modo demostración no se usan enlaces de correo." };
  try {
    const res = await confirmEmailLink(input);
    if (!res.ok) return { error: res.error };
    return { next: res.next };
  } catch (error) {
    const failed = serviceError(error);
    return { error: failed.error };
  }
}

export async function adoptSessionAction(input: { accessToken: string; refreshToken: string; type?: string }): Promise<LinkState> {
  if (isDemoMode()) return { error: "En el modo demostración no se usan enlaces de correo." };
  try {
    const res = await adoptAuthSession(input);
    if (!res.ok) return { error: res.error };
    return { next: res.next };
  } catch (error) {
    const failed = serviceError(error);
    return { error: failed.error };
  }
}

export async function logoutAction(): Promise<void> {
  await signOutAndClear();
  redirect("/admin/login");
}
