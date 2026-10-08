import { expect, test } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function makeCedula(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(first9[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    sum += p;
  }
  return `${first9}${(10 - (sum % 10)) % 10}`;
}

test("Preview: import válido y paso 3 descarga enlace /verificar/", async ({ page }) => {
  const cedula = makeCedula(`172${String(Date.now() % 1_000_000).padStart(6, "0")}`);
  const csvPath = join("/tmp", `jaime-smoke-${Date.now()}.csv`);
  writeFileSync(csvPath, `Nombres,Apellidos,Cédula\nJaime,Demo,${cedula}\n`, "utf8");

  await page.goto("/demo/entrar?destino=admin");
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/importar");
  await page.locator("#import-file").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Validar e importar" }).click();
  await expect(page.getByText("La carga fue exitosa")).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generar y descargar enlaces" }).click();
  const download = await downloadPromise;
  const saved = join("/tmp", await download.suggestedFilename());
  await download.saveAs(saved);
  const content = readFileSync(saved, "utf8");
  const urlMatch = content.match(/https?:\/\/[^\s,"]+\/verificar\/[A-Za-z0-9_-]+|\/verificar\/[A-Za-z0-9_-]+/);
  expect(urlMatch).toBeTruthy();
});
