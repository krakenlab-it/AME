import { expect, test } from "@playwright/test";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";
import { PRODUCT_SEED_TOKENS } from "../lib/seed/ci-seed";
import { DEMO_EMAIL_OTP_CODE } from "../lib/services/email-otp";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");
const EMAIL = "lucia.romero@example.invalid";

test("el enlace general pide el correo; la cédula y el código dactilar son opcionales", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await expect(page.getByRole("heading", { name: "Entra con tu correo" })).toBeVisible();
  await page.getByText("¿Dónde encuentro mi código dactilar?").click();
  await expect(page.getByRole("img", { name: /cédula anterior/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /cédula electrónica/i })).toBeVisible();
  await expect(page.getByLabel("Código dactilar")).toBeVisible();
  await expect(page.getByLabel("Número de cédula")).not.toHaveAttribute("required", "");
  // Sin Google Authenticator en el ingreso por correo.
  await expect(page.getByText(/Authenticator/)).toHaveCount(0);
  await page.getByLabel("Correo electrónico").fill("no-es-correo");
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
});

test("el correo cargado en la importación vincula la ficha sola, sin cédula", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByRole("button", { name: "Enviarme el código" }).click();

  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await expect(page.getByText("l***********@example.invalid")).toBeVisible();
  await expect(page.getByRole("button", { name: /Reenviar código en \d+ s/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Usar otro correo" })).toBeVisible();
  await expect(page.getByText(started!.cedula)).toHaveCount(0);

  await page.getByLabel("Código de acceso").fill("000000");
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page.getByText("El código no es correcto o ya venció. Revisa el último correo que te enviamos.")).toBeVisible();

  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sí, es correcta" }).click();
  await expect(page.getByLabel(/^Correo electrónico principal/)).toHaveValue(EMAIL);
});

test("un correo nuevo crea una cuenta sin vincular que no abre el formulario", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico").fill(`nuevo.${Date.now()}@example.invalid`);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeVisible();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByText("Cuenta pendiente de vínculo")).toBeVisible();
  await page.goto("/verificar/formulario");
  await expect(page).not.toHaveURL(/\/verificar\/formulario$/);
});

test("el enlace personal sigue identificando a la ficha", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.started}`);
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByRole("button", { name: "Verificar y continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
});
