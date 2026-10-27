import { expect, test, type Browser } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  ADMIN_C,
  newAdminContext,
  onboardAdmin,
  resetPeopleAndLimits,
  serviceClient,
} from "./helpers";
import {
  completeOnboarding,
  importCsv,
  openAdminPanel,
  reachDocumentStep,
  signOutRespondent,
  submitDocument,
} from "./respondent-flow";

/**
 * Pasaportes de la hoja de Sebastian, importados con el formato de 3 columnas (Nombres, Apellidos, Cédula):
 * el nombre largo de la hoja trae los apellidos primero.
 */
const OSCAR = { passport: "BH823158", firstNames: "OSCAR ALEXANDER", lastNames: "BOLIVAR BOLIVAR", email: "oscar@ame.test", dactilar: "Q1234Z5678" };
const JAVIER = { passport: "BA086520", firstNames: "JAVIER ALFONSO", lastNames: "ECHEVERRY VELASQUEZ", email: "javier@ame.test", dactilar: "R9876K5432" };
const CEDULA = { document: "1710034065", firstNames: "MARIA ELENA", lastNames: "PRUEBA CEDULA", email: "maria@ame.test", dactilar: "V1234V1234" };
const INTRUSO = "intruso@ame.test";
const ADMIN_C_PASSWORD = "Clave-Admin-C-2026-q";

test.describe.configure({ mode: "serial" });

let secretC = "";

function adminPage(browser: Browser) {
  return openAdminPanel(browser, ADMIN_C, ADMIN_C_PASSWORD, secretC);
}

test("1. el administrador importa los dos pasaportes y una cédula como los guarda producción", async ({ browser }) => {
  resetPeopleAndLimits();
  secretC = await onboardAdmin(browser, ADMIN_C, ADMIN_C_PASSWORD);
  const { context, page } = await adminPage(browser);
  const csv =
    "Nombres,Apellidos,Cédula\n" +
    `${OSCAR.firstNames},${OSCAR.lastNames},${OSCAR.passport}\n` +
    `${JAVIER.firstNames},${JAVIER.lastNames},${JAVIER.passport}\n` +
    `${CEDULA.firstNames},${CEDULA.lastNames},${CEDULA.document}\n`;
  await importCsv(page, "importacion-2026-10-13.csv", csv);

  const { data, error } = await serviceClient().from("people").select("first_names,last_names,national_id_last2,national_id_hash,status").order("last_names");
  expect(error).toBeNull();
  expect(data).toHaveLength(3);
  expect(data!.map((row) => [row.last_names, row.first_names, row.national_id_last2, row.status])).toEqual([
    ["BOLIVAR BOLIVAR", "OSCAR ALEXANDER", "58", "PENDING"],
    ["ECHEVERRY VELASQUEZ", "JAVIER ALFONSO", "20", "PENDING"],
    ["PRUEBA CEDULA", "MARIA ELENA", "65", "PENDING"],
  ]);
  await context.close();
});

test("2. Oscar entra con el pasaporte tal como está escrito y completa todo hasta la confirmación", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, OSCAR.email);
  await submitDocument(page, OSCAR.passport, OSCAR.dactilar);
  await completeOnboarding(page, "Pasaporte");
  await context.close();
});

test("3. Javier entra con el pasaporte en minúsculas y con espacios y completa todo hasta la confirmación", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, JAVIER.email);
  await submitDocument(page, " ba 086 520 ", JAVIER.dactilar.toLowerCase());
  await completeOnboarding(page, "Pasaporte");
  await context.close();
});

test("4. volver a entrar: mismo pasaporte y mismo dactilar funcionan, otro dactilar se rechaza", async ({ browser }) => {
  for (const person of [OSCAR, JAVIER]) {
    const context = await newAdminContext(browser);
    const page = await context.newPage();
    await reachDocumentStep(page, person.email);
    await submitDocument(page, person.passport, "A1111B2222");
    await expect(page.getByText(/El código dactilar no coincide/)).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
    await submitDocument(page, person.passport, person.dactilar);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await signOutRespondent(page);
    await context.close();
  }
});

test("5. otro correo no puede reclamar un pasaporte ya reclamado", async ({ browser }) => {
  for (const person of [OSCAR, JAVIER]) {
    const context = await newAdminContext(browser);
    const page = await context.newPage();
    await reachDocumentStep(page, INTRUSO);
    await submitDocument(page, person.passport, person.dactilar);
    await expect(page.getByText(/Este pasaporte ya ingresó con otro correo/)).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
    await context.close();
  }
  const { data } = await serviceClient().from("people").select("login_email").in("login_email", [INTRUSO]);
  expect(data).toEqual([]);
});

test("6. un pasaporte que no está en la lista se rechaza y no crea cuenta", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, "desconocido@ame.test");
  await submitDocument(page, "QQ999999", "Q1234Z5678");
  await expect(page.getByText(/No encontramos ese pasaporte/)).toBeVisible();
  const { data } = await serviceClient().from("people").select("id").is("self_registered_at", null);
  expect(data).toHaveLength(3);
  await context.close();
});

test("7. una cédula de 10 dígitos sigue entrando y completa todo hasta la confirmación", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, CEDULA.email);
  await submitDocument(page, CEDULA.document, CEDULA.dactilar);
  await completeOnboarding(page, "Cédula");
  await context.close();
});

test("8. el panel y el archivo para AIG incluyen a las tres personas con el documento enmascarado en pantalla", async ({ browser }) => {
  const { context, page } = await adminPage(browser);
  for (const person of [OSCAR, JAVIER]) {
    await page.goto(`/admin?q=${person.passport}`);
    const row = page.locator("tbody tr", { hasText: person.lastNames });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(person.firstNames);
    await expect(row).toContainText(`********${person.passport.slice(-2)}`);
    await expect(row).toContainText("Completado");
    await expect(row).not.toContainText(person.passport);
  }
  await page.goto("/admin");
  const autoLinks = page.getByRole("region", { name: "Vinculados automáticamente" });
  await expect(autoLinks).toContainText("BH****58");
  await expect(autoLinks).toContainText("BA****20");
  await expect(autoLinks).not.toContainText(OSCAR.passport);

  await page.goto("/admin/exportar");
  await page.getByLabel("2. Motivo o solicitud que justifica la exportación").first().fill("Prueba local de pasaportes AME 30");
  await page.getByRole("group", { name: "3. Formato" }).first().getByLabel("Texto separado por comas (.csv)").check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar archivo para AIG" }).click();
  const file = await (await download).path();
  const csv = readFileSync(file, "utf8");
  await expect(page.getByText(/Archivo generado con 3 registros/)).toBeVisible();
  for (const person of [OSCAR, JAVIER]) {
    expect(csv).toContain(person.passport);
    expect(csv).toContain(person.lastNames);
  }
  expect(csv).toContain(CEDULA.document);
  await context.close();
});
