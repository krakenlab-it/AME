import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PREVIEW_URL || "https://portal-ame-git-cursor-jaime-next-sandbox-fe7e-kraken-lab-media.vercel.app";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
