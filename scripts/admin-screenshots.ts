/**
 * Capturas del panel administrador con datos sintéticos (modo demostración).
 *
 * Uso (con el servidor de pruebas ya levantado, ver playwright.config.ts):
 *   BASE_URL=http://127.0.0.1:3000 npx tsx scripts/admin-screenshots.ts <etiqueta> <carpeta>
 *
 * No toca ninguna base real: el servidor de demostración vive en memoria y las cédulas
 * de este archivo son inventadas con dígito verificador válido.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { PRODUCT_SEED_DEMO_ADMIN, PRODUCT_SEED_DEMO_TOTP_SECRET } from "../lib/seed/ci-seed";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";
import { totpCode } from "../lib/security/totp";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const [label = "after", outDir = "/tmp/admin-shots"] = process.argv.slice(2);

const FIRST = ["Ana", "Luis", "María", "Carlos", "Sofía", "Pedro", "Elena", "Diego", "Rosa", "Jorge", "Paula", "Mateo"];
const LAST = ["Andrade", "Barrera", "Cevallos", "Durán", "Espinoza", "Freire", "Guerrero", "Herrera", "Idrovo", "Jácome"];

function makeCedula(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    sum += p;
  }
  return `${first9}${(10 - (sum % 10)) % 10}`;
}

function syntheticCsv(count: number): string {
  const lines = ["Nombres,Apellidos,Cédula"];
  for (let i = 0; i < count; i++) {
    const cedula = makeCedula(`1720${String(10_000 + i * 37).padStart(5, "0")}`);
    lines.push(`${FIRST[i % FIRST.length]},${LAST[(i * 3) % LAST.length]} ${LAST[(i * 7 + 1) % LAST.length]},${cedula}`);
  }
  return `${lines.join("\n")}\n`;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.locator("#email").fill(PRODUCT_SEED_DEMO_ADMIN.email);
  await page.locator("#password").fill(PRODUCT_SEED_DEMO_ADMIN.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(PRODUCT_SEED_DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.waitForURL(/\/admin\/?$/);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page);

  const goodCsv = join("/tmp", "admin-shots-good.csv");
  writeFileSync(goodCsv, syntheticCsv(40), "utf8");
  await page.goto("/admin/importar");
  await page.locator("#import-file").setInputFiles(goodCsv);
  await page.getByRole("button", { name: "Vista previa" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).isEnabled();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await page.getByText("La carga fue exitosa").waitFor({ timeout: 30_000 });

  const started = PRODUCT_PERSONAS.find((p) => p.key === "started");
  const badCsv = join("/tmp", "admin-shots-bad.csv");
  writeFileSync(
    badCsv,
    ["Nombres,Apellidos,Cédula", `Lucía,Ejemplo Repetida,${started?.cedula ?? ""}`, "Pedro,Sin Cédula,", "Ana,Cédula Mala,1234567890", `Nuevo,Registro Válido,${makeCedula("172099001")}`].join("\n") + "\n",
    "utf8",
  );

  const pages: { key: string; path: string; prepare?: (p: Page) => Promise<void> }[] = [
    { key: "resumen", path: "/admin" },
    { key: "resumen-filtrado", path: "/admin?estado=PENDING" },
    { key: "resumen-orden-pagina-2", path: "/admin?orden=apellidos&dir=desc&p=2" },
    { key: "resumen-sin-resultados", path: "/admin?q=zzzz" },
    { key: "importar", path: "/admin/importar" },
    {
      key: "importar-vista-previa",
      path: "/admin/importar",
      prepare: async (p) => {
        await p.locator("#import-file").setInputFiles(badCsv);
        await p.getByRole("button", { name: "Vista previa" }).click();
        await p.locator("[aria-live]").filter({ hasText: /Filas leídas|leídas/ }).first().waitFor({ timeout: 30_000 });
      },
    },
    { key: "exportar", path: "/admin/exportar" },
    { key: "auditoria", path: "/admin/auditoria" },
    { key: "aviso", path: "/admin/aviso" },
    { key: "invitar", path: "/admin/invitar" },
  ];

  const personaLinks: string[] = [];
  await page.goto("/admin");
  for (const href of await page.locator('a[href^="/admin/personas/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""))) {
    if (href && !personaLinks.includes(href)) personaLinks.push(href);
  }
  if (personaLinks[0]) {
    pages.push({ key: "persona", path: personaLinks[0] });
    pages.push({
      key: "persona-confirmacion",
      path: personaLinks[0],
      prepare: async (p) => {
        await p.getByRole("button", { name: "Revocar enlaces" }).click();
        await p.getByRole("dialog").waitFor();
      },
    });
  }

  for (const [width, height, tag] of [
    [1280, 900, "1280"],
    [390, 844, "390"],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const entry of pages) {
      await page.goto(entry.path);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      if (entry.prepare) await entry.prepare(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(outDir, `${label}-${entry.key}-${tag}.png`), fullPage: entry.key !== "persona-confirmacion" });
    }
    const menu = page.getByRole("button", { name: "Abrir el menú" });
    if (width < 1024 && (await menu.count())) {
      await page.goto("/admin");
      await page.waitForLoadState("networkidle");
      await menu.click();
      await page.getByRole("dialog").waitFor();
      await page.screenshot({ path: join(outDir, `${label}-menu-movil-${tag}.png`) });
    }
  }
  await browser.close();
}

void main();
