import { expect, test } from "@playwright/test";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";
import { PRODUCT_SEED_TOKENS } from "../lib/seed/ci-seed";
import { DEMO_EMAIL_OTP_CODE } from "../lib/services/email-otp";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");
const EMAIL = "lucia.romero@example.invalid";

async function acceptTerms(page: import("@playwright/test").Page) {
  const start = page.getByRole("button", { name: "Empezar validación" });
  const checkbox = page.getByRole("checkbox", { name: /He leído el mecanismo de identificación/ });
  await expect(start).toBeDisabled();
  await expect(checkbox).toBeDisabled();
  await page.getByRole("button", { name: "haz click aquí" }).click();
  const dialog = page.getByRole("dialog", { name: "Mecanismo de identificación y verificación de identidad" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(checkbox).toBeEnabled();
  await expect(start).toBeDisabled();
  await checkbox.check();
  await start.click();
}

test("el enlace general pide términos y correo antes de la cédula", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await expect(page.getByLabel("Correo electrónico")).toHaveCount(0);
  await acceptTerms(page);
  await expect(page.getByRole("heading", { name: "Entra con tu correo" })).toBeVisible();
  await expect(page.getByLabel("Número de cédula")).toHaveCount(0);
  await expect(page.getByText(/Authenticator/)).toHaveCount(0);
  await page.getByLabel("Correo electrónico").fill("no-es-correo");
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
});

test("el correo cargado no abre el formulario hasta la cédula y el código dactilar", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByRole("button", { name: "Enviarme el código" }).click();

  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await expect(page.getByText("l***********@example.invalid")).toBeVisible();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();

  await expect(page.getByRole("heading", { name: "Tu cédula" })).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByLabel("Número de cédula")).toHaveAttribute("required", "");
  await expect(page.getByLabel(/Código dactilar/)).toHaveAttribute("required", "");
  await expect(page.locator("#codigo-dactilar-hint")).toHaveText("Formato: letra, 4 números, letra, 4 números (ej. V1234V1234)");
  await page.getByText("¿Dónde encuentro mi código dactilar?").click();
  await expect(page.getByRole("img", { name: /cédula anterior/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /cédula electrónica/i })).toBeVisible();

  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator("#codigo-dactilar-error")).toHaveText(/Formato: letra, 4 números, letra, 4 números/);
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.getByLabel(/Código dactilar/).fill("v1234-v1234");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sí, es correcta" }).click();
  await expect(page.getByLabel(/^Correo electrónico principal/)).toHaveValue(EMAIL);
  await expect(page.getByLabel(/^Correo electrónico principal/)).toHaveJSProperty("readOnly", true);
  await expect(page.getByLabel("Confirmar correo electrónico")).toHaveCount(0);
  await expect(page.getByLabel("Correo electrónico alternativo")).toBeVisible();
});

test("un correo nuevo con cédula y código dactilar abre el formulario", async ({ page }) => {
  const email = `nuevo.${Date.now()}@example.invalid`;
  await page.goto("/ingresar");
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tu cédula" })).toBeVisible();
  await page.getByLabel("Número de cédula").fill("0926687856");
  await page.getByLabel(/Código dactilar/).fill("V1234V1234");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByRole("heading", { name: "Hola, Sin" })).toHaveCount(0);
  await expect(page.getByText("Cuenta pendiente de vínculo")).toHaveCount(0);
  await page.getByRole("button", { name: "Sí, es correcta" }).click();
  await expect(page.getByLabel("Confirmar correo electrónico")).toHaveCount(0);
  await expect(page.getByLabel(/^Correo electrónico principal/)).toHaveValue(email);
  await expect(page.getByLabel(/^Correo electrónico principal/)).toHaveJSProperty("readOnly", true);
});

test("un código dactilar distinto explica dónde está y el formato", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByLabel(/Código dactilar/).fill("A9876B4321");
  await page.getByRole("button", { name: "Continuar" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "reverso de tu cédula" });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("V1234V1234");
});

test("el enlace personal sigue vigente y entra por correo y cédula", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.started}`);
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByLabel(/Código dactilar/).fill("V1234V1234");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
});
