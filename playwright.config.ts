import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const port = 3000;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * El servidor de estas pruebas es el build ya compilado, en memoria.
 * DEMO_MODE solo vale porque APP_STAGE es development. No hay claves de Supabase.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: { baseURL, trace: "on-first-retry" },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DEMO_MODE: "true",
      SEED_PRODUCT_USERS: "true",
      APP_STAGE: "development",
      VERCEL_ENV: "",
      APP_BASE_URL: baseURL,
      ENCRYPTION_KEY: process.env.E2E_ENCRYPTION_KEY || randomBytes(32).toString("base64"),
      HASH_PEPPER: process.env.E2E_HASH_PEPPER || randomBytes(48).toString("base64url"),
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
