import { afterEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { GET as retention } from "@/app/api/cron/retention/route";
import { apiErrorSchema, healthResponseSchema, retentionResponseSchema } from "@/lib/contracts/api";

const globalRepo = globalThis as { __portalRepo?: unknown };

afterEach(() => {
  delete process.env.DEMO_MODE;
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_ENV;
  delete process.env.APP_STAGE;
  delete globalRepo.__portalRepo;
});

describe("GET /api/health", () => {
  it("responde solo ok y no se cachea", async () => {
    const res = health();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(healthResponseSchema.parse(await res.json())).toEqual({ ok: true });
  });
});

describe("GET /api/cron/retention", () => {
  it("niega la llamada sin el secreto", async () => {
    process.env.CRON_SECRET = "s".repeat(24);
    const res = await retention(new Request("https://portal.test/api/cron/retention"));
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json())).toEqual({ error: "No autorizado" });
  });

  it("niega un secreto demasiado corto aunque coincida", async () => {
    process.env.CRON_SECRET = "corto";
    const res = await retention(new Request("https://portal.test/api/cron/retention", { headers: { authorization: "Bearer corto" } }));
    expect(res.status).toBe(401);
  });

  it("anonimiza cuando el bearer es el secreto y DEMO_MODE no es producción", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.VERCEL_ENV;
    delete process.env.APP_STAGE;
    process.env.CRON_SECRET = "cron-secret-for-tests";
    const res = await retention(
      new Request("https://portal.test/api/cron/retention", {
        headers: { authorization: "Bearer cron-secret-for-tests" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(retentionResponseSchema.parse(await res.json())).toEqual({ ok: true, anonymized: 0 });
  });
});
