import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { signInTestAdmin } from "./helpers/admin-login";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";

const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started")!;

function makeCedula(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    sum += p;
  }
  return `${first9}${(10 - (sum % 10)) % 10}`;
}

/** Sube un archivo de prueba con cédulas inventadas para que la tabla tenga más de una página. */
async function importSyntheticPeople(page: Page, count: number): Promise<void> {
  const rows = ["Nombres,Apellidos,Cédula"];
  const letters = (n: number) => [...n.toString(26).padStart(2, "0")].map((c) => String.fromCharCode(97 + Number.parseInt(c, 26))).join("");
  for (let i = 0; i < count; i++) rows.push(`Persona${letters(i)},Prueba${letters(i)},${makeCedula(`1730${String(20_000 + i * 13).padStart(5, "0")}`)}`);
  const file = join("/tmp", `admin-panel-${Date.now()}.csv`);
  writeFileSync(file, `${rows.join("\n")}\n`, "utf8");
  await page.goto("/admin/importar");
  await page.locator("#import-file").setInputFiles(file);
  await page.getByRole("button", { name: "Vista previa" }).click();
  await expect(page.getByText("No se escribió nada.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByText("La carga fue exitosa")).toBeVisible({ timeout: 30_000 });
}

test.describe.configure({ mode: "serial" });

/**
 * Una sola sesión para todo el archivo: el ingreso al panel limita los intentos por correo (5 cada 15 minutos)
 * y las demás pruebas del panel también ingresan.
 */
let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await signInTestAdmin(page);
});

test.afterAll(async () => {
  await page.close();
});

test.describe("panel administrador rediseñado", () => {
  test.beforeEach(async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  });

  test("la navegación agrupa las secciones y marca la página actual", async () => {
    const nav = page.getByRole("navigation", { name: "Administración", exact: true });
    for (const group of ["Datos", "Control", "Equipo"]) await expect(nav.getByText(group, { exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Auditoría" }).click();
    await expect(page).toHaveURL(/\/admin\/auditoria$/);
    await expect(page.getByRole("heading", { level: 1, name: "Auditoría" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Auditoría" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Resumen" })).not.toHaveAttribute("aria-current", "page");

    for (const [link, title] of [
      ["Importar y enlaces", "Importar y enlaces"],
      ["Archivo para AIG", "Archivo para AIG"],
      ["Aviso de privacidad", "Aviso de privacidad"],
      ["Invitar personal", "Invitar personal"],
    ] as const) {
      await nav.getByRole("link", { name: link }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(nav.getByRole("link", { name: link })).toHaveAttribute("aria-current", "page");
    }
  });

  test("el resumen muestra los cuatro estados y las acciones rápidas", async () => {
    const states = page.getByRole("region", { name: "Personas por estado" });
    for (const label of ["Pendiente", "Iniciado", "Completado", "Requiere revisión"]) {
      await expect(states.getByRole("link", { name: new RegExp(label) })).toBeVisible();
    }
    const quick = page.getByRole("region", { name: "Acciones rápidas" });
    await expect(quick.getByRole("link", { name: /Cargar personas/ })).toHaveAttribute("href", "/admin/importar");
    await expect(quick.getByRole("link", { name: /Descargar para AIG/ })).toHaveAttribute("href", "/admin/exportar");
  });

  test("la tabla filtra por estado, busca, ordena y nunca muestra la cédula completa", async () => {
    await page.goto("/admin");
    const table = page.getByRole("table", { name: "Personas invitadas y su estado" });
    const completed = PRODUCT_PERSONAS.find((p) => p.key === "completed")!;

    await page.getByRole("navigation", { name: "Filtrar por estado" }).getByRole("link", { name: /^Completado/ }).click();
    await expect(page).toHaveURL(/estado=COMPLETED/);
    await expect(table.getByRole("cell", { name: completed.currentFirstNames, exact: true })).toBeVisible();
    const rowCount = await table.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);
    await expect(table.locator("tbody tr").filter({ hasText: "Completado" })).toHaveCount(rowCount);
    await expect(table.getByText("Pendiente")).toHaveCount(0);

    await page.goto(`/admin?q=${encodeURIComponent(started.currentLastNames)}`);
    await expect(table.getByRole("cell", { name: started.currentFirstNames, exact: true })).toBeVisible();
    await expect(table.getByRole("cell", { name: completed.currentFirstNames, exact: true })).toHaveCount(0);

    await page.goto("/admin?q=zzzzzz");
    await expect(page.getByText("No encontramos registros con estos filtros")).toBeVisible();
    await page.getByRole("link", { name: "Quitar los filtros" }).click();
    await expect(page).toHaveURL(/\/admin\??$/);

    await page.goto("/admin?orden=apellidos&dir=asc");
    const header = table.getByRole("columnheader", { name: /^Apellidos/ });
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    const firstRowAsc = await table.locator("tbody tr").first().getByRole("rowheader").innerText();
    await header.getByRole("link").click();
    await expect(page).toHaveURL(/dir=desc/);
    await expect(table.getByRole("columnheader", { name: /^Apellidos/ })).toHaveAttribute("aria-sort", "descending");
    const firstRowDesc = await table.locator("tbody tr").first().getByRole("rowheader").innerText();
    expect(firstRowDesc.localeCompare(firstRowAsc, "es")).toBeGreaterThan(0);

    const text = await table.innerText();
    expect(text).not.toContain(completed.cedula);
    expect(text).not.toMatch(/\b\d{10}\b/);
  });

  test("la paginación avanza y conserva el orden", async () => {
    await importSyntheticPeople(page, 30);
    await page.goto("/admin?orden=apellidos&dir=asc");
    const pagination = page.getByRole("navigation", { name: "Paginación" });
    await expect(pagination.getByText(/Mostrando 1–25 de \d+ registros/)).toBeVisible();
    await pagination.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/p=2/);
    await expect(page).toHaveURL(/orden=apellidos/);
    await expect(page.getByRole("navigation", { name: "Paginación" }).getByText(/Mostrando 26–/)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Paginación" }).getByRole("link", { name: "Anterior" })).toBeVisible();
  });

  test("la vista previa del importador dice qué hacer cuando la cédula ya existe", async () => {
    const file = join("/tmp", `admin-panel-dup-${Date.now()}.csv`);
    writeFileSync(file, `Nombres,Apellidos,Cédula\nLucía,Repetida,${started.cedula}\n`, "utf8");
    await page.goto("/admin/importar");
    await page.locator("#import-file").setInputFiles(file);
    await expect(page.getByRole("listitem").filter({ hasText: "Revisar la vista previa" })).toHaveAttribute("aria-current", "step");
    await page.getByRole("button", { name: "Vista previa" }).click();
    await expect(page.getByText("La cédula ya existe en la base de datos")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Quita la fila del archivo/)).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Qué hacer" }).first()).toBeVisible();
    await expect(page.getByText(started.cedula)).toHaveCount(0);
  });

  test("revocar enlaces pide confirmación y se puede cancelar con el teclado", async () => {
    await page.goto("/admin");
    await page.getByRole("link", { name: new RegExp(`Ver ficha de ${started.currentFirstNames}`) }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(started.currentFirstNames) })).toBeVisible();

    const revoke = page.getByRole("button", { name: "Revocar enlaces" });
    await revoke.click();
    const dialog = page.getByRole("dialog", { name: "¿Revocar los enlaces?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/Enlaces revocados/)).toHaveCount(0);

    await revoke.click();
    await page.getByRole("dialog").getByRole("button", { name: "Revocar enlaces" }).click();
    await expect(page.getByText(/Enlaces revocados: \d+/)).toBeVisible();
  });

  test("restablecer el código no abre la confirmación si falta el código del administrador", async () => {
    await page.goto("/admin");
    await page.getByRole("link", { name: new RegExp(`Ver ficha de ${started.currentFirstNames}`) }).click();
    await page.getByRole("button", { name: "Restablecer código y verificación" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#reset-totp").fill("123456");
    await page.getByRole("button", { name: "Restablecer código y verificación" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Borrar el código y la verificación?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("panel administrador en teléfono (390 px)", () => {
  test.beforeEach(async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Resumen" })).toBeVisible();
  });

  test("el menú deslizable abre, navega y se cierra con Escape", async () => {
    await expect(page.getByRole("navigation", { name: "Administración", exact: true })).toBeHidden();

    const open = page.getByRole("button", { name: "Abrir el menú" });
    await open.click();
    const drawer = page.getByRole("dialog", { name: "Menú del panel administrativo" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Resumen" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(open).toBeFocused();

    await open.click();
    await page.getByRole("dialog").getByRole("link", { name: "Auditoría" }).click();
    await expect(page).toHaveURL(/\/admin\/auditoria$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Auditoría" })).toBeVisible();
  });

  test("las páginas principales no se desbordan horizontalmente", async () => {
    for (const path of ["/admin", "/admin/importar", "/admin/exportar", "/admin/auditoria", "/admin/aviso", "/admin/invitar"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} se desborda`).toBeLessThanOrEqual(0);
    }
  });
});
