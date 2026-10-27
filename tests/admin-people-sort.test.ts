import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import type { NewPersonRow } from "@/lib/database/types";

function person(n: number, first: string, last: string): NewPersonRow {
  return {
    first_names: first,
    last_names: last,
    national_id_encrypted: `enc-${n}`,
    national_id_hash: `hash-${n}`,
    national_id_last2: String(10 + n),
  };
}

async function seeded() {
  const repo = new MemoryRepo();
  await repo.insertPeople([person(1, "Zoila", "Andrade"), person(2, "Ana", "Zambrano"), person(3, "Mateo", "Castro")]);
  return repo;
}

describe("listPeople con orden", () => {
  it("sin orden mantiene el comportamiento anterior", async () => {
    const repo = await seeded();
    const { rows } = await repo.listPeople({ page: 1, pageSize: 10 });
    expect(rows.map((r) => r.last_names)).toEqual(["Andrade", "Zambrano", "Castro"]);
  });

  it("ordena por apellidos y nombres en ambas direcciones", async () => {
    const repo = await seeded();
    const asc = await repo.listPeople({ page: 1, pageSize: 10, sort: { by: "last_names", dir: "asc" } });
    expect(asc.rows.map((r) => r.last_names)).toEqual(["Andrade", "Castro", "Zambrano"]);
    const desc = await repo.listPeople({ page: 1, pageSize: 10, sort: { by: "first_names", dir: "desc" } });
    expect(desc.rows.map((r) => r.first_names)).toEqual(["Zoila", "Mateo", "Ana"]);
  });

  it("conserva el total y la paginación al ordenar", async () => {
    const repo = await seeded();
    const second = await repo.listPeople({ page: 2, pageSize: 2, sort: { by: "last_names", dir: "asc" } });
    expect(second.total).toBe(3);
    expect(second.rows.map((r) => r.last_names)).toEqual(["Zambrano"]);
  });
});
