import { afterEach, describe, expect, it } from "vitest";
import { previewSandboxPublicBaseUrl } from "@/lib/demo-mode";
import { settings } from "@/lib/services/settings";

const KEYS = ["VERCEL_ENV", "VERCEL_URL", "VERCEL_BRANCH_URL", "NEXT_PUBLIC_VERCEL_URL", "APP_STAGE", "PORTAL_PREVIEW_SANDBOX_BUILD", "APP_BASE_URL", "NEXT_PHASE"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clear() {
  for (const k of KEYS) delete process.env[k];
}

describe("previewSandboxPublicBaseUrl", () => {
  it("en producción de Vercel no usa VERCEL_BRANCH_URL (-git-main) y deja APP_BASE_URL", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "ame-portal-abc123-krakenlab.vercel.app";
    process.env.VERCEL_BRANCH_URL = "ame-portal-git-main-krakenlab.vercel.app";
    process.env.APP_BASE_URL = "https://portal.example.ec/";
    expect(previewSandboxPublicBaseUrl()).toBeNull();
    expect(settings.baseUrl()).toBe("https://portal.example.ec");
  });

  it("en producción tampoco cuando el build quedó marcado como sandbox", () => {
    clear();
    process.env.VERCEL_ENV = "production";
    process.env.PORTAL_PREVIEW_SANDBOX_BUILD = "true";
    process.env.VERCEL_BRANCH_URL = "ame-portal-git-main-krakenlab.vercel.app";
    expect(previewSandboxPublicBaseUrl()).toBeNull();
  });

  it("en Preview sigue usando la URL de la rama", () => {
    clear();
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "ame-portal-abc123-krakenlab.vercel.app";
    process.env.VERCEL_BRANCH_URL = "ame-portal-git-feature-x-krakenlab.vercel.app";
    expect(previewSandboxPublicBaseUrl()).toBe("https://ame-portal-git-feature-x-krakenlab.vercel.app");
  });

  it("fuera de Vercel no devuelve nada", () => {
    clear();
    expect(previewSandboxPublicBaseUrl()).toBeNull();
  });
});
