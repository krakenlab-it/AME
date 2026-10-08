import { expect, test } from "@playwright/test";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";
import { PRODUCT_SEED_TOKENS } from "../lib/seed/ci-seed";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");

test("el enlace general pide cédula y código dactilar", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await expect(page.getByRole("heading", { name: "Entra con tu cédula" })).toBeVisible();
  await expect(page.getByLabel("Código dactilar")).toBeVisible();
  await page.getByLabel("Número de cédula").fill("1300000013");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("No pudimos verificar la información proporcionada. Revisa los datos o contacta al administrador.")).toBeVisible();
});

test("la primera vez muestra el código para la aplicación de verificación", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Configura tu verificación" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Código para agregar la cuenta en tu aplicación de verificación" })).toBeVisible();
  await expect(page.getByText(started!.cedula)).toHaveCount(0);
});

test("el enlace personal sigue identificando a la ficha", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.started}`);
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByRole("button", { name: "Verificar y continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await expect(page.getByText(started!.currentFirstNames, { exact: true })).toBeVisible();
});
