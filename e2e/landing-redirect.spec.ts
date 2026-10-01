import { expect, test } from "@playwright/test";

test("quien no tiene sesión se queda en la portada", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Para comenzar, abre tu enlace personal" })).toBeVisible();

  await page.goto("/?fin=cuenta");
  await expect(page).toHaveURL(/\/\?fin=cuenta$/);
  await expect(page.getByText("Sesión cerrada")).toBeVisible();
});

test("una sesión de administración vuelve al panel desde la portada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar como administrador" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
});

test("una sesión del asegurado vuelve a mi cuenta desde la portada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Entrar a mi cuenta/ }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByRole("heading", { name: "Mi registro" })).toBeVisible();
});
