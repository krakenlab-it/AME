import { expect, test, type Page } from "@playwright/test";
import { DEMO_EMAIL_OTP_CODE } from "../lib/services/email-otp";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");
const EMAIL = "lucia.romero@example.invalid";

async function acceptTerms(page: Page) {
  const start = page.getByRole("button", { name: "Empezar validación" });
  const checkbox = page.getByRole("checkbox", { name: /He leído el mecanismo de identificación/ });
  await page.getByRole("button", { name: "haz click aquí" }).click();
  await page.keyboard.press("Escape");
  await checkbox.check();
  await start.click();
}

test("la revisión envía la ficha vinculada y no regresa a contacto sin decir por qué", async ({ page }) => {
  expect(started).toBeTruthy();
  await page.goto("/ingresar");
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(EMAIL);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await page.getByLabel("Número de cédula").fill(started!.cedula);
  await page.getByLabel(/Código dactilar/).fill("V1234V1234");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);

  await page.getByRole("button", { name: "Sí, es correcta" }).click();
  await page.getByLabel("Correo electrónico alternativo").fill("secundario@hotmail.com");
  await page.getByLabel("Teléfono celular").fill("0991234567");
  await page.getByLabel("Dirección domiciliaria").fill("Leonardo Vigagomez, S/N, Daniel Brito");
  await page.getByLabel("Complemento / Departamento / Referencia").fill("Garage Negro");
  await page.getByLabel("Ciudad").fill("Quito");
  await page.getByLabel("Provincia").selectOption("Pichincha");
  await page.getByLabel("Código postal").fill("593");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByLabel("Banco").selectOption("Banco Pichincha");
  await page.getByRole("radio", { name: "Ahorros" }).check();
  await page.locator("#bank\\.accountNumber").fill("2200004821");
  await page.locator("#bank\\.accountNumberConfirm").fill("2200004821");
  await page.getByRole("checkbox", { name: /cuenta bancaria/i }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  const consents = page.getByRole("checkbox");
  await expect(consents).toHaveCount(3);
  for (const box of await consents.all()) await box.check();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Revisa tu información" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar mi información" }).click();
  await expect(page).toHaveURL(/\/confirmacion$/, { timeout: 20_000 });
  await expect(page.getByText("No se pudo enviar")).toHaveCount(0);
});
