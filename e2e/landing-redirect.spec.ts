import { expect, test } from "@playwright/test";
import { signInTestAdmin } from "./helpers/admin-login";
import { PRODUCT_SEED_TOKENS } from "../lib/seed/ci-seed";
import { PRODUCT_PERSONAS } from "../lib/seed/product-personas";

test("la portada lleva al ingreso con correo, sin pedir la cédula", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Ingrese con su correo para actualizar sus datos/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo funciona" })).toBeVisible();
  await expect(page.getByText("Escribe tu número de cédula. Es obligatorio. El código dactilar del reverso de tu cédula física es opcional.")).toBeVisible();
  await expect(page.getByLabel(/Digita su número de cédula para empezar/i)).toHaveCount(0);
  await expect(page.getByText(/Confirme su cédula/i)).toHaveCount(0);
  await expect(page.getByText(/Si forma parte del equipo/i)).toBeVisible();
  const enter = page.getByRole("link", { name: "Ingresar", exact: true });
  await expect(enter).toHaveAttribute("href", "/ingresar");
  await enter.click();
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByRole("heading", { name: "Antes de empezar" })).toBeVisible();
});

test("/ingreso redirige a /ingresar", async ({ page }) => {
  await page.goto("/ingreso");
  await expect(page).toHaveURL(/\/ingresar$/);
});

test("la portada y /ingresar ofrecen el panel de administración protegido", async ({ page }) => {
  await page.goto("/");
  const adminLink = page.getByRole("link", { name: "Panel de administración" });
  await expect(adminLink).toHaveAttribute("href", "/admin");
  await page.goto("/ingresar");
  await expect(page.getByRole("link", { name: "Panel de administración" })).toHaveAttribute("href", "/admin");
  await page.getByRole("link", { name: "Panel de administración" }).click();
  // Sin sesión, la barrera del panel manda al login.
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("una sesión de administración en /ingresar va al panel", async ({ page }) => {
  await signInTestAdmin(page);
  await page.goto("/ingresar");
  await expect(page).toHaveURL(/\/admin$/);
});

test("quien no tiene sesión se queda en la portada", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Ingrese con su correo para actualizar sus datos/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para comenzar, abre tu enlace personal" })).toHaveCount(0);
  const staffLogin = page.getByRole("link", { name: "Iniciar sesión con correo" });
  await expect(staffLogin).toBeVisible();
  await expect(staffLogin).toHaveAttribute("href", "/admin/login");
  await staffLogin.click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole("heading", { name: "Panel administrativo" })).toBeVisible();

  await page.goto("/?fin=cuenta");
  await expect(page).toHaveURL(/\/\?fin=cuenta$/);
  await expect(page.getByText("Sesión cerrada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar sesión con correo" })).toHaveAttribute("href", "/admin/login");
});

test("una sesión de administración vuelve al panel desde la portada", async ({ page }) => {
  await signInTestAdmin(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Resumen" })).toBeVisible();
});

test("una sesión del asegurado vuelve a mi cuenta desde la portada", async ({ page }) => {
  const completed = PRODUCT_PERSONAS.find((persona) => persona.key === "completed");
  expect(completed).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.completed}/estado`);
  await page.getByLabel("Número de cédula").fill(completed!.cedula);
  await page.getByRole("button", { name: "Ver mi cuenta" }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/mi-cuenta$/);
  await expect(page.getByRole("heading", { name: "Mi registro" })).toBeVisible();
});

test("el enlace /empezar reinicia en la portada aunque haya sesión de mi cuenta", async ({ page }) => {
  const completed = PRODUCT_PERSONAS.find((persona) => persona.key === "completed");
  expect(completed).toBeTruthy();
  await page.goto(`/verificar/${PRODUCT_SEED_TOKENS.completed}/estado`);
  await page.getByLabel("Número de cédula").fill(completed!.cedula);
  await page.getByRole("button", { name: "Ver mi cuenta" }).click();
  await expect(page).toHaveURL(/\/mi-cuenta$/);

  await page.goto("/empezar");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Ingrese con su correo para actualizar sus datos/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ingresar", exact: true })).toHaveAttribute("href", "/ingresar");
});
