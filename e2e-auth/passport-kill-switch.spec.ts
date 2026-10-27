import { expect, test } from "@playwright/test";
import {
  ADMIN_D,
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
  submitDocument,
} from "./respondent-flow";

/**
 * Solo corre con el servidor arrancado con AME_PASSPORT_SIGNIN=off:
 *   AME_PASSPORT_SIGNIN=off npx playwright test -c playwright.auth.config.ts e2e-auth/passport-kill-switch.spec.ts
 * Con el interruptor encendido (lo normal) se omite y el resto de la suite cubre el ingreso con pasaporte.
 */
test.skip(process.env.AME_PASSPORT_SIGNIN?.trim().toLowerCase() !== "off", "Requiere AME_PASSPORT_SIGNIN=off");
test.describe.configure({ mode: "serial" });

const PASSPORT = { document: "BH823158", firstNames: "OSCAR ALEXANDER", lastNames: "BOLIVAR BOLIVAR", email: "off-oscar@ame.test", dactilar: "Q1234Z5678" };
const CEDULA = { document: "1710034065", firstNames: "MARIA ELENA", lastNames: "PRUEBA CEDULA", email: "off-maria@ame.test", dactilar: "V1234V1234" };
const PASSPORT_GENERAL_MESSAGE = "Si tu documento es un pasaporte, usa el enlace personal que recibiste. Este ingreso es para cédula y código dactilar.";
const ADMIN_D_PASSWORD = "Clave-Admin-D-2026-q";

test("1. con el interruptor apagado se importa igual un pasaporte y una cédula", async ({ browser }) => {
  resetPeopleAndLimits();
  const secret = await onboardAdmin(browser, ADMIN_D, ADMIN_D_PASSWORD);
  const { context, page } = await openAdminPanel(browser, ADMIN_D, ADMIN_D_PASSWORD, secret);
  const csv = "Nombres,Apellidos,Cédula\n" + [PASSPORT, CEDULA].map((p) => `${p.firstNames},${p.lastNames},${p.document}`).join("\n") + "\n";
  await importCsv(page, "importacion.csv", csv);
  await context.close();
});

test("2. la portada y /ingresar vuelven al texto de solo cédula", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Confirma tu identidad con tu cédula", { exact: true })).toBeVisible();
  await expect(page.getByText("Escribe tu número de cédula y el código dactilar del reverso. Formato: letra, 4 números, letra, 4 números (ej. V1234V1234).")).toBeVisible();
  await reachDocumentStep(page, PASSPORT.email, false);
  await expect(page.getByLabel("Número de cédula", { exact: false })).toBeVisible();
  await expect(page.getByText("Número de cédula o pasaporte")).toHaveCount(0);
  await expect(page.getByText("10 números, como en tu cédula.")).toBeVisible();
  await context.close();
});

test("3. un pasaporte ya importado se rechaza como en main y no se vincula", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, PASSPORT.email, false);
  await submitDocument(page, PASSPORT.document, PASSPORT.dactilar, false);
  await expect(page.getByText(PASSPORT_GENERAL_MESSAGE).first()).toBeVisible();
  await expect(page).toHaveURL(/\/ingresar/);
  await context.close();

  const { data } = await serviceClient().from("people").select("login_email").eq("last_names", PASSPORT.lastNames);
  expect(data).toEqual([{ login_email: null }]);
});

test("4. la cédula entra y completa hasta la confirmación igual que siempre", async ({ browser }) => {
  const context = await newAdminContext(browser);
  const page = await context.newPage();
  await reachDocumentStep(page, CEDULA.email, false);
  await submitDocument(page, CEDULA.document, CEDULA.dactilar, false);
  await completeOnboarding(page, "Cédula");
  await context.close();
});
