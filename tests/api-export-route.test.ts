import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportError } from "@/lib/services/export";
import { apiErrorSchema } from "@/lib/contracts/api";

const { adminForAction, logSecurityEvent, createAigExport } = vi.hoisted(() => ({
  adminForAction: vi.fn(),
  logSecurityEvent: vi.fn(),
  createAigExport: vi.fn(),
}));

vi.mock("@/lib/server/admin-guard", () => ({
  adminForAction: (...args: unknown[]) => adminForAction(...args),
}));

vi.mock("@/lib/database", () => ({
  getRepo: () => ({ logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args) }),
}));

vi.mock("@/lib/services/export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/export")>("@/lib/services/export");
  return {
    ...actual,
    createAigExport: (...args: unknown[]) => createAigExport(...args),
  };
});

import { POST } from "@/app/api/admin/export/route";

const allowed = { profile: "RECLAMOS", format: "csv", purpose: "Envío mensual de reembolsos a AIG" };

function call(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://portal.test/api/admin/export", {
      method: "POST",
      headers: {
        origin: "https://portal.test",
        host: "portal.test",
        "content-type": "application/json",
        ...headers,
      },
      body,
    }),
  );
}

beforeEach(() => {
  adminForAction.mockReset();
  logSecurityEvent.mockReset();
  createAigExport.mockReset();
  adminForAction.mockResolvedValue({ admin: { id: "admin-1", role: "EXPORTER" } });
});

describe("POST /api/admin/export", () => {
  it("rechaza otro origen antes de mirar la sesión", async () => {
    const res = await call(JSON.stringify(allowed), { origin: "https://evil.test" });
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(await res.json()).error).toMatch(/origen/i);
    expect(adminForAction).not.toHaveBeenCalled();
  });

  it("rechaza a quien no tiene permiso y deja constancia, sin datos personales", async () => {
    adminForAction.mockResolvedValue(null);
    const res = await call(JSON.stringify(allowed));
    expect(res.status).toBe(403);
    expect(logSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "EXPORT_DENIED" }));
    const detail = logSecurityEvent.mock.calls[0]?.[0] as { detail?: unknown };
    expect(detail.detail).toBeUndefined();
  });

  it("rechaza JSON inválido, campos extra y perfiles ajenos", async () => {
    expect((await call("{")).status).toBe(400);
    expect((await call(JSON.stringify({ ...allowed, personId: "x" }))).status).toBe(400);
    expect((await call(JSON.stringify({ ...allowed, profile: "TODO" }))).status).toBe(400);
    expect(createAigExport).not.toHaveBeenCalled();
  });

  it("devuelve el archivo y no guarda un enlace público", async () => {
    createAigExport.mockResolvedValue({
      buffer: Buffer.from("codigo,nombre"),
      filename: "AIG_reclamos_2026-09-30.csv",
      count: 2,
      contentType: "text/csv; charset=utf-8",
    });
    const res = await call(JSON.stringify(allowed));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="AIG_reclamos_2026-09-30.csv"');
    expect(res.headers.get("x-record-count")).toBe("2");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.text()).toBe("codigo,nombre");
    expect(createAigExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ adminId: "admin-1", role: "EXPORTER", profile: "RECLAMOS", format: "csv", purpose: allowed.purpose }),
    );
  });

  it("traduce un error de negocio a 400 y oculta un fallo interno", async () => {
    createAigExport.mockRejectedValueOnce(new ExportError("Describe la finalidad de la exportación (entre 10 y 300 caracteres)."));
    const bad = await call(JSON.stringify({ ...allowed, purpose: "corto" }));
    expect(bad.status).toBe(400);
    expect(apiErrorSchema.parse(await bad.json()).error).toMatch(/10 y 300/);

    createAigExport.mockRejectedValueOnce(new Error("supabase secret sk_live"));
    const broken = await call(JSON.stringify(allowed));
    expect(broken.status).toBe(500);
    const body = apiErrorSchema.parse(await broken.json());
    expect(body.error).toBe("No se pudo generar el archivo.");
    expect(JSON.stringify(body)).not.toMatch(/secret|sk_live|supabase/i);
  });
});
