import { expect, test } from "@playwright/test";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET } from "../lib/seed/ci-seed";
import { totpCode } from "../lib/security/totp";

test("el panel administrador explica el acceso, la carga y la ficha con código", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Estás en la versión administrador" })).toBeVisible();
  await expect(page.getByText("Solo por invitación", { exact: true })).toBeVisible();
  await expect(page.getByText("Verificación en dos pasos", { exact: true })).toBeVisible();
  await expect(page.getByText("Todo queda registrado", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /Entrar como administrador/ }).first().click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  await page.goto("/admin/login");
  await page.locator("#email").fill(PRODUCT_SEED_DEMO_ADMIN.email);
  await page.locator("#password").fill(PRODUCT_SEED_DEMO_ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();

  await page.getByRole("link", { name: "Importar y enlaces" }).click();
  await expect(page.getByRole("heading", { name: "1. Cargar base inicial" })).toBeVisible();
  await expect(page.getByText(/cédula/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "2. Enlaces para registros sin enlace vigente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generar enlaces faltantes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "3. Enviar el enlace por correo" })).toBeVisible();
  await expect(page.getByText("RESEND_API_KEY no está configurada.")).toBeVisible();
  await page.getByRole("button", { name: "Enviar enlaces por correo" }).click();
  await expect(page.getByText("RESEND_API_KEY no está configurada.")).toHaveCount(2);

  await page.getByRole("link", { name: "Archivo para AIG" }).click();
  await expect(page.getByText("Gestión de reclamos (contacto, sin datos bancarios)")).toBeVisible();
  await expect(page.getByText("Pago de reembolsos (incluye datos bancarios)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Carga de contacto para Unibrokers" })).toBeVisible();
  await expect(page.getByText(/UNIBROKERS_API_URL/)).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("link", { name: /Ver ficha de Camila/ }).click();
  await expect(page.getByRole("heading", { name: "Cambio manual" })).toBeVisible();
  await page.getByLabel("Código de verificación").fill("000000");
  await page.getByRole("button", { name: "Guardar cambio manual" }).click();
  await expect(page.getByText(/no es correcto o ya venció/i)).toBeVisible();

  await page.getByLabel("Correo para el enlace").fill("camila.enlace@example.com");
  await page.getByLabel("Código de verificación").fill(totpCode(PRODUCT_SEED_DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Guardar cambio manual" }).click();
  await expect(page.getByText("Cambio guardado. Quedó en la auditoría con tu usuario.")).toBeVisible();
});
