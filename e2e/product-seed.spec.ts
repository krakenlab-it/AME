import { expect, test } from "@playwright/test";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET, PRODUCT_SEED_TOKENS } from "../lib/seed/ci-seed";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";
import { totpCode } from "../lib/security/totp";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");
const completed = PRODUCT_PERSONAS.find((persona) => persona.key === "completed");
const review = PRODUCT_PERSONAS.find((persona) => persona.key === "needsReview");

test("el enlace en curso identifica a la ficha sintética", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.started}`);
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByRole("button", { name: "Verificar y continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
  await expect(page.getByText(started!.currentLastNames, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Ver el estado de mi actualización" }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByRole("heading", { name: "Hola, Lucía" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avisos" })).toBeVisible();
  await expect(page.getByText("Iniciado").first()).toBeVisible();
  await page.getByRole("link", { name: "Continuar la actualización" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
});

test("un enlace ya usado no abre el formulario", async ({ page }) => {
  expect(completed).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.completed}`);
  await expect(page.getByRole("heading", { name: "Este enlace no está disponible" })).toBeVisible();
  await expect(page.getByText(/ya fue utilizado/i)).toBeVisible();
  await expect(page.getByLabel("Número de cédula")).toHaveCount(0);
});

test("un enlace ya usado abre mi cuenta en lectura, no el formulario", async ({ page }) => {
  expect(completed).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.completed}`);
  await page.getByRole("link", { name: "Consultar el estado de mi registro" }).click();
  await expect(page).toHaveURL(new RegExp(`/verificar/${PRODUCT_SEED_TOKENS.completed}/estado`));
  await page.getByLabel("Número de cédula").fill(completed!.cedula);
  await page.getByRole("button", { name: "Ver mi cuenta" }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByText(completed!.confirmationCode!)).toBeVisible();
  await expect(page.getByText("Completado").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar la actualización" })).toHaveCount(0);
  await expect(page.getByText(completed!.bank!.account_number)).toHaveCount(0);
  await expect(page.getByText(completed!.contact!.primary_email)).toHaveCount(0);
  await expect(page.getByText("••••••••4819")).toBeVisible();
});

test("en modo demostración se entra a mi cuenta sin Supabase Auth", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Entrar a mi cuenta/ }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByRole("heading", { name: /Hola,/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mi registro" })).toBeVisible();
  await expect(page.getByText(/AIG-/)).toBeVisible();
});

test("el panel muestra las tres fichas del seed", async ({ page }) => {
  expect(review).toBeTruthy();
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Probar el portal" })).toBeVisible();
  await page.locator("#email").fill(PRODUCT_SEED_DEMO_ADMIN.email);
  await page.locator("#password").fill(PRODUCT_SEED_DEMO_ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(PRODUCT_SEED_DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
  await expect(page.getByRole("cell", { name: started!.currentFirstNames, exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: completed!.currentFirstNames, exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: review!.currentFirstNames, exact: true })).toBeVisible();
});
