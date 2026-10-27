import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_EMAIL_OTP_CODE } from "../lib/services/email-otp";
import { signInTestAdmin } from "./helpers/admin-login";

const STAMP = String(Date.now() % 1_000_000).padStart(6, "0");
const PASSPORT = `ZQ${STAMP}`;
const EMAIL = `pasaporte.${STAMP}@example.invalid`;
const DACTILAR = "V1234V1234";

async function acceptTerms(page: Page) {
  await page.getByRole("button", { name: "haz click aquí" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: /He leído el mecanismo de identificación/ }).check();
  await page.getByRole("button", { name: "Empezar validación" }).click();
}

async function reachDocumentStep(page: Page, email: string) {
  await page.goto("/ingresar");
  await acceptTerms(page);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await page.getByLabel("Código de acceso").fill(DEMO_EMAIL_OTP_CODE);
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page.getByRole("heading", { name: "Tu cédula o pasaporte" })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  const csvPath = join("/tmp", `pasaporte-${STAMP}.csv`);
  writeFileSync(csvPath, `Nombres,Apellidos,Pasaporte,Correo\nElena,Viajera Demo,${PASSPORT},${EMAIL}\n`, "utf8");
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3000" });
  const page = await context.newPage();
  await signInTestAdmin(page);
  await page.goto("/admin/importar");
  await page.locator("#import-file").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByText("No se escribió nada.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByText("La carga fue exitosa")).toBeVisible({ timeout: 30_000 });
  await context.close();
});

test("un pasaporte que no está importado se rechaza en español y no crea cuenta", async ({ page }) => {
  await reachDocumentStep(page, `nadie.${STAMP}@example.invalid`);
  await page.getByLabel("Número de cédula o pasaporte").fill("QQ999999");
  await page.getByLabel(/Código dactilar/).fill(DACTILAR);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(/No encontramos ese pasaporte/)).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);
});

test("un pasaporte importado entra por /ingresar y completa todo el formulario hasta el envío", async ({ page }) => {
  await reachDocumentStep(page, EMAIL);
  await expect(page.getByLabel("Número de cédula o pasaporte")).toHaveAttribute("required", "");
  await page.getByLabel("Número de cédula o pasaporte").fill(` ${PASSPORT.slice(0, 2).toLowerCase()} ${PASSPORT.slice(2)} `);
  await page.getByLabel(/Código dactilar/).fill("v1234 v1234");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/verificar\/formulario$/);

  await expect(page.getByText("Pasaporte", { exact: true })).toBeVisible();
  await expect(page.getByText(`ZQ****${PASSPORT.slice(-2)}`)).toBeVisible();
  await page.getByRole("button", { name: "Sí, es correcta" }).click();
  await expect(page).toHaveURL(/paso=3/);
  await expect(page.getByLabel("Correo electrónico principal")).toHaveValue(EMAIL);
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
  await expect(page.getByText("Pasaporte", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Enviar mi información" }).click();
  await expect(page).toHaveURL(/\/confirmacion$/, { timeout: 20_000 });
  await expect(page.getByText("No se pudo enviar")).toHaveCount(0);
});

test("después de enviar, el mismo pasaporte solo entra con el mismo código dactilar", async ({ page }) => {
  await reachDocumentStep(page, EMAIL);
  await page.getByLabel("Número de cédula o pasaporte").fill(PASSPORT);
  await page.getByLabel(/Código dactilar/).fill("A9876B4321");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText(/El código dactilar no coincide/)).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);
});
