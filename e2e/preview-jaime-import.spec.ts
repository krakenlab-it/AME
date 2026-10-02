import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const CEDULA = "1710034065";

test("Preview: import válido y paso 3 descarga enlace /verificar/", async ({ page }) => {
  const csvPath = join("/tmp", `jaime-smoke-${Date.now()}.csv`);
  writeFileSync(csvPath, `Nombres,Apellidos,Cédula\nJaime,Demo,${CEDULA}\n`, "utf8");

  await page.goto("/demo/entrar?destino=admin");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/importar");
  await page.locator("#import-file").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Validar e importar" }).click();
  await expect(page.getByText(/Se importaron/i)).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar y descargar enlaces" }).click();
  await expect(page.getByText(/Se generaron \d+ enlaces/i)).toBeVisible({ timeout: 30_000 });
  const download = await downloadPromise;
  const csvText = await (await download.createReadStream())!.read?.() ?? "";
  const body = typeof csvText === "string" ? csvText : Buffer.from([]).toString();
  const saved = join("/tmp", await download.suggestedFilename());
  await download.saveAs(saved);
  const content = await import("node:fs/promises").then((fs) => fs.readFile(saved, "utf8"));
  expect(content).toMatch(/\/verificar\/[A-Za-z0-9_-]+/);
  test.info().attach("sample-link", { body: content.match(/\/verificar\/[A-Za-z0-9_-]+/)?.[0] ?? "", contentType: "text/plain" });
});
