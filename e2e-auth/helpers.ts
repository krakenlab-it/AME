import { execFileSync } from "node:child_process";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { totpCode } from "../lib/security/totp";
import { readLocalStack } from "./local-stack";

export const ADMIN_A = "admin-a@ame.test";
export const ADMIN_B = "admin-b@ame.test";
export const ADMIN_EMAILS = [ADMIN_A, ADMIN_B];
export const CANONICAL_BASE = "http://www.ame.test:3000";
export const APEX_BASE = "http://ame.test:3000";

export const WRONG_CODE_MESSAGE = "El código no es correcto o ya venció";
export const LINK_ERROR_TEXT = "El enlace no es válido o ya venció";

interface MailSummary {
  ID: string;
  Created: string;
  Subject: string;
  To: { Address: string }[];
}

function mailUrl(): string {
  return readLocalStack().mailUrl;
}

export async function mailCount(to: string): Promise<number> {
  const res = await fetch(`${mailUrl()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=100`);
  const body = (await res.json()) as { messages: MailSummary[] };
  return body.messages.length;
}

/** Espera un correo nuevo para ese destinatario y devuelve el enlace principal del mensaje. */
export async function waitForMailLink(to: string, previousCount: number): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailUrl()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=100`);
    const body = (await res.json()) as { messages: MailSummary[] };
    if (body.messages.length > previousCount) {
      const newest = [...body.messages].sort((a, b) => b.Created.localeCompare(a.Created))[0]!;
      const full = (await (await fetch(`${mailUrl()}/api/v1/message/${newest.ID}`)).json()) as { HTML: string; Text: string };
      const hrefs = [...full.HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
      const link = hrefs.find((href) => /verify|confirm/.test(href)) ?? hrefs[0];
      if (!link) throw new Error("El correo no trae enlace.");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`No llegó correo para ${to}.`);
}

export function serviceClient(): SupabaseClient {
  const stack = readLocalStack();
  return createClient(stack.apiUrl, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function anonClient(): SupabaseClient {
  const stack = readLocalStack();
  return createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Solo contra la base local del contenedor de Supabase. */
export function localSql(sql: string): void {
  execFileSync("docker", ["exec", "supabase_db_ame-portal", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "ignore" });
}

/** Una IP distinta por contexto: el tope por IP no se mezcla entre escenarios. */
function randomClientIp(): string {
  const part = () => 1 + Math.floor(Math.random() * 250);
  return `10.${part()}.${part()}.${part()}`;
}

export async function newAdminContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomClientIp() } });
  // El dominio sin www redirige a www, como en producción.
  await context.route(`${APEX_BASE}/**`, (route) => {
    const target = route.request().url().replace("//ame.test:", "//www.ame.test:");
    return route.fulfill({ status: 308, headers: { location: target } });
  });
  return context;
}

const lastCode = new Map<string, string>();

/** Código TOTP de la aplicación autenticadora. Espera al siguiente intervalo si el código ya se usó. */
export async function freshTotp(secret: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const code = totpCode(secret);
    if (lastCode.get(secret) !== code) {
      lastCode.set(secret, code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No se pudo obtener un código TOTP nuevo.");
}

export async function expectPanel(page: Page) {
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
}

export async function logout(page: Page) {
  await page.locator("button:visible", { hasText: "Salir" }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

export async function submitMfaCode(page: Page, secret: string) {
  await page.locator("#code").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Verificar código" }).click();
}

/** Invitación -> contraseña -> TOTP. Devuelve el secreto del autenticador. */
export async function onboardAdmin(browser: Browser, email: string, password: string): Promise<string> {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  const link = await waitForMailLink(email, 0);
  await page.goto(link);
  await expect(page).toHaveURL(/\/admin\/registro/);
  await expect(page.locator("#totp")).toHaveCount(0);
  await page.locator("#password").fill(password);
  await page.locator("#confirm").fill(password);
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await page.getByText("No puedo escanear el código").click();
  const secret = (await page.locator("details p.font-mono").innerText()).trim();
  await submitMfaCode(page, secret);
  await expectPanel(page);
  await context.close();
  return secret;
}

/** Cada escenario parte sin topes acumulados por los anteriores; el escenario d prueba el tope real. */
export async function clearAuthRateLimits(): Promise<void> {
  const { error } = await serviceClient().from("rate_limits").delete().like("bucket", "admin-%");
  if (error) throw new Error(`No se pudieron limpiar los topes: ${error.message}`);
}
