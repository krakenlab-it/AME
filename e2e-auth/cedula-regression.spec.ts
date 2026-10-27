import { expect, test, type Browser } from "@playwright/test";
import {
  ADMIN_D,
  clearRespondentLimits,
  newAdminContext,
  onboardAdmin,
  resetPeopleAndLimits,
  serviceClient,
} from "./helpers";
import {
  completeOnboarding,
  confirmNamesStep,
  expectConfirmation,
  fillBankStep,
  fillConsentsStep,
  fillContactStep,
  importCsv,
  openAdminPanel,
  reachDocumentStep,
  signOutRespondent,
  submitDocument,
  submitReview,
} from "./respondent-flow";

/**
 * Regresión de cédulas con Supabase real: el cambio de pasaportes (AME #30) no puede alterar
 * el ingreso normal por /ingresar. Los textos esperados son los de `main`.
 */
const WRONG_FINGERPRINT = /El código dactilar no coincide\. Lo encuentras al reverso de tu cédula: una letra, 4 números, una letra y 4 números \(ej\. V1234V1234\)\./;
const ADMIN_D_PASSWORD = "Clave-Admin-D-2026-q";

const BRAND_NEW = { cedula: "1710034040", email: "cedula-nueva@ame.test", dactilar: "N1234N5678", firstNames: "NUEVA PERSONA", lastNames: "CEDULA NUEVA" };
const AUTO_LINK = { cedula: "1710034008", firstNames: "ANA LUCIA", lastNames: "IMPORTADA UNO", email: "cedula-ana@ame.test", dactilar: "A1234B5678" };
const SPACED = { cedula: "1710034016", spaced: "1710 034 016", firstNames: "BEATRIZ", lastNames: "IMPORTADA DOS", email: "cedula-beatriz@ame.test", dactilar: "B1234C5678" };
const OLD_PAYLOAD = { cedula: "1710034024", firstNames: "CARLOS", lastNames: "IMPORTADO TRES", email: "cedula-carlos@ame.test", dactilar: "C1234D5678" };
const RESUME_PASO = { cedula: "1710034032", firstNames: "DIANA", lastNames: "IMPORTADA CUATRO", email: "cedula-diana@ame.test", dactilar: "D1234E5678" };
const RESUME_RELOAD = { cedula: "1710034073", firstNames: "ELENA", lastNames: "IMPORTADA CINCO", email: "cedula-elena@ame.test", dactilar: "E1234F5678" };
const IMPORTED = [AUTO_LINK, SPACED, OLD_PAYLOAD, RESUME_PASO, RESUME_RELOAD];

test.describe.configure({ mode: "serial" });

let secretD = "";

test.beforeEach(() => {
  clearRespondentLimits();
});

function freshContext(browser: Browser) {
  return newAdminContext(browser);
}

async function expectPersonRow(email: string) {
  const { data, error } = await serviceClient().from("people").select("id,self_registered_at,status,login_email,first_names,last_names").eq("login_email", email);
  expect(error).toBeNull();
  return data ?? [];
}

test("1. el administrador importa cinco cédulas con el formato de tres columnas", async ({ browser }) => {
  resetPeopleAndLimits();
  secretD = await onboardAdmin(browser, ADMIN_D, ADMIN_D_PASSWORD);
  const { context, page } = await openAdminPanel(browser, ADMIN_D, ADMIN_D_PASSWORD, secretD);
  const csv = "Nombres,Apellidos,Cédula\n" + IMPORTED.map((p) => `${p.firstNames},${p.lastNames},${p.cedula}`).join("\n") + "\n";
  await importCsv(page, "importacion-cedulas.csv", csv);
  const { data, error } = await serviceClient().from("people").select("last_names,status").order("last_names");
  expect(error).toBeNull();
  expect(data).toHaveLength(IMPORTED.length);
  expect(data!.every((row) => row.status === "PENDING")).toBe(true);
  await context.close();
});

test("2. una cédula nueva con su primer código dactilar crea la cuenta y completa hasta la confirmación", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, BRAND_NEW.email);
  await submitDocument(page, BRAND_NEW.cedula, BRAND_NEW.dactilar);
  await completeOnboarding(page, "Cédula", { firstNames: BRAND_NEW.firstNames, lastNames: BRAND_NEW.lastNames });
  await context.close();

  const rows = await expectPersonRow(BRAND_NEW.email);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.self_registered_at).toBeTruthy();
  // Los nombres se escribieron a mano (la cuenta nueva no traía ninguno), así que queda en revisión.
  expect(rows[0]!.status).toBe("NEEDS_REVIEW");
});

test("3. una cédula importada se vincula sola con su primer código dactilar y completa hasta la confirmación", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, AUTO_LINK.email);
  await submitDocument(page, AUTO_LINK.cedula, AUTO_LINK.dactilar);
  await completeOnboarding(page, "Cédula");
  await context.close();

  const rows = await expectPersonRow(AUTO_LINK.email);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ self_registered_at: null, status: "COMPLETED", first_names: AUTO_LINK.firstNames, last_names: AUTO_LINK.lastNames });
  const { data: audit } = await serviceClient().from("audit_logs").select("action,masked_cedula").eq("person_id", rows[0]!.id).eq("action", "PERSON_AUTO_LINKED");
  expect(audit).toEqual([{ action: "PERSON_AUTO_LINKED", masked_cedula: "17******08" }]);
});

test("4. quien vuelve con la misma cédula y el mismo código dactilar entra, cerrar sesión funciona", async ({ browser }) => {
  for (const [person, state] of [[AUTO_LINK, "Completado"], [BRAND_NEW, "Requiere revisión"]] as const) {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await reachDocumentStep(page, person.email);
    await submitDocument(page, person.cedula, person.dactilar);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await expect(page.getByText(state, { exact: true }).first()).toBeVisible();
    await signOutRespondent(page);
    await context.close();
  }
});

test("5. un código dactilar distinto se rechaza con el mismo texto y la persona sigue pudiendo entrar", async ({ browser }) => {
  for (const person of [AUTO_LINK, BRAND_NEW]) {
    const context = await freshContext(browser);
    const page = await context.newPage();
    await reachDocumentStep(page, person.email);
    await submitDocument(page, person.cedula, "Z9999Z9999");
    await expect(page.getByText(WRONG_FINGERPRINT)).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
    await submitDocument(page, person.cedula, person.dactilar);
    await expect(page).toHaveURL(/\/mi-cuenta$/);
    await context.close();
  }
});

test("5b. una cédula equivocada o ya reclamada se rechaza con los textos de cédula de siempre", async ({ browser }) => {
  const wrongCedula = "La cédula no coincide. Revisa que sean los 10 números de tu cédula, sin espacios ni guiones.";
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, AUTO_LINK.email);
  await submitDocument(page, SPACED.cedula, SPACED.dactilar);
  await expect(page.getByText(wrongCedula)).toBeVisible();
  await expect(page.getByText(/El pasaporte no coincide/)).toHaveCount(0);
  await expect(page).toHaveURL(/\/ingresar/);
  await context.close();

  const other = await freshContext(browser);
  const otherPage = await other.newPage();
  await reachDocumentStep(otherPage, "cedula-intruso@ame.test");
  await submitDocument(otherPage, AUTO_LINK.cedula, AUTO_LINK.dactilar);
  await expect(otherPage.getByText(/Esta cédula ya ingresó con otro correo/)).toBeVisible();
  await expect(otherPage).toHaveURL(/\/ingresar/);
  await other.close();
});

test("6. una cédula escrita con espacios se normaliza y completa hasta la confirmación", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, SPACED.email);
  await submitDocument(page, ` ${SPACED.spaced} `, SPACED.dactilar);
  await completeOnboarding(page, "Cédula");
  await context.close();
  const rows = await expectPersonRow(SPACED.email);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ self_registered_at: null, status: "COMPLETED" });
});

test("7. el formulario antiguo (campos cedula y codigoDactilar) sigue funcionando sin cambios", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  const bodies: string[] = [];
  page.on("request", (request) => {
    const body = request.method() === "POST" ? request.postDataBuffer()?.toString("utf8") : undefined;
    if (body && /name="_\d+_cedula"/.test(body)) bodies.push(body);
  });
  await reachDocumentStep(page, OLD_PAYLOAD.email);
  await expect(page.locator('input[name="cedula"]')).toHaveCount(1);
  await expect(page.locator('input[name="codigoDactilar"]')).toHaveCount(1);
  await submitDocument(page, OLD_PAYLOAD.cedula, OLD_PAYLOAD.dactilar);
  await completeOnboarding(page, "Cédula");
  await context.close();

  expect(bodies).toHaveLength(1);
  const fields = [...bodies[0]!.matchAll(/name="_\d+_([^"]+)"/g)].map((match) => match[1]!);
  expect(fields).toEqual(["phase", "cedula", "codigoDactilar"]);
});

test("8. quien quedó a medias vuelve con ?paso=4 y termina hasta la confirmación", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, RESUME_PASO.email);
  await submitDocument(page, RESUME_PASO.cedula, RESUME_PASO.dactilar);
  await expect(page).toHaveURL(/\/verificar\/formulario$/);
  await confirmNamesStep(page, "Cédula");
  await fillContactStep(page);
  await expect(page).toHaveURL(/paso=4/);

  await page.goto("/verificar/formulario?paso=4");
  await expect(page.getByLabel("Banco")).toBeVisible();
  await fillBankStep(page);
  await fillConsentsStep(page);
  await submitReview(page);
  // El contacto quedó vacío al reanudar: el envío final devuelve al paso 3 (comportamiento de main) y se termina desde ahí.
  await expect(page.getByRole("heading", { name: "Datos de contacto" })).toBeVisible({ timeout: 30_000 });
  await fillContactStep(page);
  await fillBankStep(page);
  await fillConsentsStep(page);
  await submitReview(page);
  await expectConfirmation(page);
  await context.close();
});

test("9. quien recarga en el paso de la cédula empieza de nuevo y termina hasta la confirmación", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, RESUME_RELOAD.email);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
  await reachDocumentStep(page, RESUME_RELOAD.email);
  await submitDocument(page, RESUME_RELOAD.cedula, RESUME_RELOAD.dactilar);
  await completeOnboarding(page, "Cédula");
  await context.close();
});
