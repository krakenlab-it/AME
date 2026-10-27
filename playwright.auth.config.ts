import { defineConfig, devices } from "@playwright/test";

/**
 * Recuperación del panel contra Supabase Auth real (GoTrue local con Docker).
 * No corre en CI: necesita `supabase start`. Ver e2e-auth/README.md.
 * Los dominios *.ame.test se resuelven a 127.0.0.1 solo dentro de Chromium.
 */
export const AUTH_E2E_PORT = 3000;
export const AUTH_E2E_HOST = "www.ame.test";

export default defineConfig({
  testDir: "e2e-auth",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e-auth/global-setup.ts",
  use: {
    baseURL: `http://${AUTH_E2E_HOST}:${AUTH_E2E_PORT}`,
    trace: "retain-on-failure",
    launchOptions: { args: ["--host-resolver-rules=MAP ame.test 127.0.0.1, MAP www.ame.test 127.0.0.1"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
