import { expect, test } from "@playwright/test";
import {
  ADMIN_A,
  ADMIN_B,
  anonClient,
  APEX_BASE,
  CANONICAL_BASE,
  expectPanel,
  freshTotp,
  LINK_ERROR_TEXT,
  localSql,
  clearAuthRateLimits,
  login,
  logout,
  mailCount,
  newAdminContext,
  onboardAdmin,
  serviceClient,
  submitMfaCode,
  waitForMailLink,
  WRONG_CODE_MESSAGE,
} from "./helpers";
import type { Page } from "@playwright/test";

const PASSWORD_A1 = "Clave-Inicial-A-2026-x";
const PASSWORD_A2 = "Clave-Nueva-A-2026-y";
const PASSWORD_A3 = "Clave-Otro-Dispositivo-2026-z";
const PASSWORD_B = "Clave-Inicial-B-2026-x";

test.describe.configure({ mode: "serial" });

let secretA = "";

async function requestReset(page: Page, email: string): Promise<string> {
  await page.goto(`${APEX_BASE}/admin/recuperar`);
  await expect(page).toHaveURL(/www\.ame\.test/);
  const before = await mailCount(email);
  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: "Enviarme el enlace" }).click();
  await expect(page.getByText("Si ese correo tiene un acceso de administrador")).toBeVisible();
  return waitForMailLink(email, before);
}

function linkBase(link: string): string {
  const url = new URL(link);
  const redirect = url.searchParams.get("redirect_to");
  return new URL(redirect ?? link).origin;
}

test("b. invitación de un admin nuevo (sin factor): guarda la contraseña sin código y luego enrola TOTP", async ({ browser }) => {
  const secretB = await onboardAdmin(browser, ADMIN_B, PASSWORD_B);
  expect(secretB).toMatch(/^[A-Z2-7]{16,}$/);
});

test("preparación: el admin A entra por invitación, enrola TOTP e ingresa una vez", async ({ browser }) => {
  secretA = await onboardAdmin(browser, ADMIN_A, PASSWORD_A1);
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await login(page, ADMIN_A, PASSWORD_A1);
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await submitMfaCode(page, secretA);
  await expectPanel(page);
  await context.close();
});

test("a. restablecer con TOTP: base canónica, código obligatorio, contraseñas conservadas, AAL2 y reingreso", async ({ browser }) => {
  await clearAuthRateLimits();
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  const link = await requestReset(page, ADMIN_A);
  expect(linkBase(link)).toBe(CANONICAL_BASE);

  await page.goto(link);
  await expect(page).toHaveURL(/\/admin\/restablecer/);
  await expect(page.locator("#totp")).toBeVisible();

  await page.locator("#password").fill(PASSWORD_A2);
  await page.locator("#confirm").fill(PASSWORD_A2);
  await page.locator("#totp").fill("000000");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible();
  await expect(page.locator("#password")).toHaveValue(PASSWORD_A2);
  await expect(page.locator("#confirm")).toHaveValue(PASSWORD_A2);
  await expect(page.locator("#totp")).toHaveValue("");
  await expect(page.locator("#totp")).toBeFocused();
  expect((await anonClient().auth.signInWithPassword({ email: ADMIN_A, password: PASSWORD_A1 })).error).toBeNull();

  await page.locator("#totp").fill("123");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByText("Escribe el código de 6 dígitos")).toBeVisible();
  await expect(page.locator("#password")).toHaveValue(PASSWORD_A2);
  expect((await anonClient().auth.signInWithPassword({ email: ADMIN_A, password: PASSWORD_A1 })).error).toBeNull();

  await page.locator("#totp").fill(await freshTotp(secretA));
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expectPanel(page);
  await logout(page);

  await login(page, ADMIN_A, PASSWORD_A2);
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await submitMfaCode(page, secretA);
  await expectPanel(page);
  await logout(page);

  await login(page, ADMIN_A, PASSWORD_A1);
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  expect((await anonClient().auth.signInWithPassword({ email: ADMIN_A, password: PASSWORD_A1 })).error).not.toBeNull();
  await context.close();
});

test("c. enlace usado o vencido muestra el texto real y pedir uno nuevo funciona", async ({ browser }) => {
  await clearAuthRateLimits();
  const context = await newAdminContext(browser);
  const page = await context.newPage();

  const used = await requestReset(page, ADMIN_A);
  await page.goto(used);
  await expect(page).toHaveURL(/\/admin\/restablecer/);
  const second = await context.newPage();
  await second.goto(used);
  await expect(second.getByText(LINK_ERROR_TEXT)).toBeVisible();
  await second.close();

  await context.clearCookies();
  const stale = await requestReset(page, ADMIN_A);
  localSql(`update auth.users set recovery_sent_at = now() - interval '3 hours' where email = '${ADMIN_A}'`);
  const expired = await context.newPage();
  await expired.goto(stale);
  await expect(expired.getByText(LINK_ERROR_TEXT)).toBeVisible();
  await expired.close();

  await context.clearCookies();
  const fresh = await requestReset(page, ADMIN_A);
  await page.goto(fresh);
  await expect(page).toHaveURL(/\/admin\/restablecer/);
  await expect(page.locator("#totp")).toBeVisible();
  await context.close();
});

test("d. el tope de /admin/recuperar explica cómo seguir y se levanta al pasar la ventana", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await page.goto("/admin/recuperar");
  const email = "limite@ame.test";
  const send = async () => {
    await page.locator("#email").fill(email);
    const answered = page.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/admin/recuperar"));
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await answered;
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await send();
    await expect(page.getByText("Si ese correo tiene un acceso de administrador")).toBeVisible();
  }
  await send();
  const blocked = page.getByText(/Demasiados intentos\. Espera 15 minutos/);
  await expect(blocked).toBeVisible();
  await expect(page.getByText(/correo más reciente/)).toBeVisible();

  const aged = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error } = await serviceClient().from("rate_limits").update({ window_start: aged }).like("bucket", "admin-login-%");
  expect(error).toBeNull();
  await send();
  await expect(page.getByText("Si ese correo tiene un acceso de administrador")).toBeVisible();
  await context.close();
});

test("e. el enlace del correo funciona en otro navegador que el que lo pidió", async ({ browser }) => {
  await clearAuthRateLimits();
  const requester = await newAdminContext(browser);
  const requesterPage = await requester.newPage();
  const link = await requestReset(requesterPage, ADMIN_A);
  expect(link).toContain("token_hash=");
  expect(new URL(link).origin).toBe(CANONICAL_BASE);

  const other = await newAdminContext(browser);
  const otherPage = await other.newPage();
  await otherPage.goto(link);
  await expect(otherPage).toHaveURL(/\/admin\/restablecer/);
  await expect(otherPage.locator("#totp")).toBeVisible();

  await otherPage.locator("#password").fill(PASSWORD_A3);
  await otherPage.locator("#confirm").fill(PASSWORD_A3);
  await otherPage.locator("#totp").fill(await freshTotp(secretA));
  await otherPage.getByRole("button", { name: "Guardar contraseña" }).click();
  await expectPanel(otherPage);
  await logout(otherPage);
  await login(otherPage, ADMIN_A, PASSWORD_A3);
  await submitMfaCode(otherPage, secretA);
  await expectPanel(otherPage);
  await requester.close();
  await other.close();
});
