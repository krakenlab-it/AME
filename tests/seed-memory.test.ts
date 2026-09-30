import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { assertDemoAllowed, isDemoMode } from "@/lib/demo-mode";
import { PRODUCT_SEED_TOKENS } from "@/lib/seed/ci-seed";
import { loadProductSeed } from "@/lib/seed/load-memory";
import { PRODUCT_PERSONAS } from "@/lib/seed/product-personas";
import { identify } from "@/lib/services/respondent";

const deps = { ipHash: "ci", captchaEnabled: false, verifyCaptcha: async () => true };

describe("seed KAN-106 en memoria", () => {
  it("deja los tres estados y solo el enlace en curso acepta la cédula", async () => {
    const repo = new MemoryRepo();
    const links = loadProductSeed(repo);
    expect(links).toHaveLength(3);
    expect(await repo.statusCounts()).toEqual({ PENDING: 0, STARTED: 1, COMPLETED: 1, NEEDS_REVIEW: 1 });

    const started = PRODUCT_PERSONAS.find((persona) => persona.key === "started");
    const completed = PRODUCT_PERSONAS.find((persona) => persona.key === "completed");
    expect(started && completed).toBeTruthy();

    const open = await identify(repo, { token: PRODUCT_SEED_TOKENS.started, cedula: started!.cedula }, deps);
    expect(open.ok).toBe(true);

    const used = await identify(repo, { token: PRODUCT_SEED_TOKENS.completed, cedula: completed!.cedula }, deps);
    expect(used.ok).toBe(false);
    if (used.ok) return;
    expect(used.linkState).toBe("used");

    for (const token of Object.values(PRODUCT_SEED_TOKENS)) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    }
  });

  it("no abre el modo demostración en producción aunque se pida el seed", () => {
    const previous = {
      DEMO_MODE: process.env.DEMO_MODE,
      SEED_PRODUCT_USERS: process.env.SEED_PRODUCT_USERS,
      VERCEL_ENV: process.env.VERCEL_ENV,
      APP_STAGE: process.env.APP_STAGE,
    };
    process.env.DEMO_MODE = "true";
    process.env.SEED_PRODUCT_USERS = "true";
    process.env.VERCEL_ENV = "production";
    delete process.env.APP_STAGE;
    expect(isDemoMode()).toBe(false);
    expect(() => assertDemoAllowed()).toThrow(/DEMO_MODE no está permitido en producción/);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
