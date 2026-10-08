import { expect, type Page } from "@playwright/test";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET } from "../../lib/seed/ci-seed";
import { totpCode } from "../../lib/security/totp";

/** Correo y código del teléfono del administrador que solo existe en el servidor de pruebas. */
export async function signInTestAdmin(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Probar el portal" })).toHaveCount(0);
  await expect(page.getByText("Entrar como administrador")).toHaveCount(0);
  await page.locator("#email").fill(PRODUCT_SEED_DEMO_ADMIN.email);
  await page.locator("#password").fill(PRODUCT_SEED_DEMO_ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(PRODUCT_SEED_DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
}
