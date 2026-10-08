import { afterEach, describe, expect, it } from "vitest";
import { deployStage } from "@/lib/privacy/readiness";

const KEYS = ["VERCEL_ENV", "APP_STAGE"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("deployStage", () => {
  it("prioriza VERCEL_ENV=preview sobre APP_STAGE=production", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.APP_STAGE = "production";
    expect(deployStage()).toBe("preview");
  });

  it("usa APP_STAGE cuando no hay VERCEL_ENV", () => {
    delete process.env.VERCEL_ENV;
    process.env.APP_STAGE = "production";
    expect(deployStage()).toBe("production");
  });
});
