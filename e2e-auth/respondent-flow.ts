import { expect, type Browser, type Page } from "@playwright/test";
import { expectPanel, login, mailCount, newAdminContext, submitMfaCode, waitForMailCode } from "./helpers";

export async function acceptTerms(page: Page) {
  await page.getByRole("button", { name: "haz click aquí" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: /He leído el mecanismo de identificación/ }).check();
  await page.getByRole("button", { name: "Empezar validación" }).click();
}

/** /ingresar con el correo y el código que llega a Mailpit. Termina en el paso de documento. */
export async function reachDocumentStep(page: Page, email: string, passportCopy = true) {
  await page.goto("/ingresar");
  await acceptTerms(page);
  const before = await mailCount(email);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme el código" }).click();
  await page.getByLabel("Código de acceso").fill(await waitForMailCode(email, before));
  await page.getByRole("button", { name: "Confirmar y continuar" }).click();
  await expect(page.getByRole("heading", { name: passportCopy ? "Tu cédula o pasaporte" : "Tu cédula", exact: true })).toBeVisible();
}

export async function submitDocument(page: Page, document: string, dactilar: string, passportCopy = true) {
  await page.getByLabel(passportCopy ? "Número de cédula o pasaporte" : "Número de cédula").fill(document);
  await page.getByLabel(/Código dactilar/).fill(dactilar);
  await page.getByRole("button", { name: "Continuar" }).click();
}

/** Paso 2: nombres. Una cuenta nueva no trae nombres y los escribe; una ficha importada los confirma. */
export async function confirmNamesStep(page: Page, documentLabel: "Pasaporte" | "Cédula", typedNames?: { firstNames: string; lastNames: string }) {
  await expect(page.getByText(documentLabel, { exact: true })).toBeVisible();
  if (typedNames) {
    await page.getByRole("button", { name: "Necesito corregirla" }).click();
    await page.locator("#names\\.firstNames").fill(typedNames.firstNames);
    await page.locator("#names\\.lastNames").fill(typedNames.lastNames);
    await page.getByRole("button", { name: "Continuar" }).click();
  } else {
    await page.getByRole("button", { name: "Sí, es correcta" }).click();
  }
  await expect(page).toHaveURL(/paso=3/);
}

export async function fillContactStep(page: Page) {
  await expect(page.getByRole("heading", { name: "Datos de contacto" })).toBeVisible();
  await page.getByLabel("Teléfono celular").fill("0991234567");
  await page.getByLabel("Dirección domiciliaria").fill("Leonardo Vigagomez, S/N, Daniel Brito");
  await page.getByLabel("Complemento / Departamento / Referencia").fill("Garage Negro");
  await page.getByLabel("Ciudad").fill("Quito");
  await page.getByLabel("Provincia").selectOption("Pichincha");
  await page.getByLabel("Código postal").fill("593");
  await page.getByRole("button", { name: "Continuar" }).click();
}

export async function fillBankStep(page: Page) {
  await page.getByLabel("Banco").selectOption("Banco Pichincha");
  await page.getByRole("radio", { name: "Ahorros" }).check();
  await page.locator("#bank\\.accountNumber").fill("2200004821");
  await page.locator("#bank\\.accountNumberConfirm").fill("2200004821");
  await page.getByRole("checkbox", { name: /cuenta bancaria/i }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
}

export async function fillConsentsStep(page: Page) {
  const consents = page.getByRole("checkbox");
  await expect(consents).toHaveCount(3);
  for (const box of await consents.all()) await box.check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu información" })).toBeVisible();
}

export async function submitReview(page: Page) {
  await page.getByRole("button", { name: "Enviar mi información" }).click();
}

export async function expectConfirmation(page: Page) {
  await expect(page).toHaveURL(/\/confirmacion$/, { timeout: 30_000 });
  await expect(page.getByText("No se pudo enviar")).toHaveCount(0);
}

/** Del formulario recién abierto hasta la página de confirmación. */
export async function completeOnboarding(page: Page, documentLabel: "Pasaporte" | "Cédula", typedNames?: { firstNames: string; lastNames: string }) {
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await confirmNamesStep(page, documentLabel, typedNames);
  await fillContactStep(page);
  await fillBankStep(page);
  await fillConsentsStep(page);
  await submitReview(page);
  await expectConfirmation(page);
}

export async function signOutRespondent(page: Page) {
  await page.goto("/mi-cuenta");
  await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
  await expect(page).toHaveURL(/\/\?fin=cuenta/);
  await page.goto("/mi-cuenta");
  await expect(page.getByRole("heading", { name: "Tu cuenta no está abierta" })).toBeVisible();
}
/** Entra al panel con un admin ya enrolado. */
export async function openAdminPanel(browser: Browser, email: string, password: string, secret: string) {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await login(page, email, password);
  await submitMfaCode(page, secret);
  await expectPanel(page);
  return { context, page };
}

/** Importa un CSV por el importador del panel y espera el aviso de éxito. */
export async function importCsv(page: Page, name: string, csv: string) {
  await page.goto("/admin/importar");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#import-file")).toHaveCount(1);
  await page.locator("#import-file").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByText("No se escribió nada.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByText("La carga fue exitosa")).toBeVisible({ timeout: 90_000 });
}
