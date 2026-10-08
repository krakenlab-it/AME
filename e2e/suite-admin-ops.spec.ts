import { expect, test } from "@playwright/test";
import { signInTestAdmin } from "./helpers/admin-login";

test("el panel administrador explica el acceso, la carga y la ficha con código", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Usted está en la versión administrador" })).toBeVisible();
  await expect(page.getByText("Solo por invitación", { exact: true })).toBeVisible();
  await expect(page.getByText("Verificación en dos pasos", { exact: true })).toBeVisible();
  await expect(page.getByText("Auditoría completa", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Probar el portal" })).toHaveCount(0);
  await expect(page.getByText("Entrar como administrador")).toHaveCount(0);

  await signInTestAdmin(page);

  await page.getByRole("link", { name: "Importar y enlaces" }).click();
  await expect(page.getByRole("heading", { name: "1. Cargar base inicial" })).toBeVisible();
  await expect(page.getByText(/cédula/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. Enlaces para registros sin enlace vigente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generar enlaces faltantes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Enlace para completar datos" })).toBeVisible();
  await expect(page.getByText(/RESEND_API_KEY/)).toHaveCount(0);
  await page.getByRole("button", { name: "Generar y descargar enlaces" }).click();
  await expect(page.getByText("No hay registros válidos importados.")).not.toBeVisible();

  await page.getByRole("link", { name: "Archivo para AIG" }).click();
  await expect(page.getByText("Gestión de reclamos (contacto, sin datos bancarios)")).toBeVisible();
  await expect(page.getByText("Pago de reembolsos (incluye datos bancarios)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carga de contacto para Unibrokers" })).toBeVisible();
  await expect(page.getByText(/UNIBROKERS_API_URL/)).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("link", { name: /Ver ficha de Camila/ }).click();
  await expect(page.getByRole("heading", { name: "Cambio manual" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill("111111");
  await page.getByRole("button", { name: "Guardar cambio manual" }).click();
  await expect(page.getByText(/no es correcto o ya venció/i)).toBeVisible();
});
