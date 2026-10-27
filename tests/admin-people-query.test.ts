import { describe, expect, it } from "vitest";
import { importRowAdvice } from "@/lib/admin/import-advice";
import { buildQuery, nextSort, pageWindow, parsePageParam, parsePeopleSort, parseStatusParam, totalPages } from "@/lib/admin/people-query";

describe("parámetros de la tabla de personas", () => {
  it("ordena solo por columnas conocidas", () => {
    expect(parsePeopleSort("apellidos", "desc")).toEqual({ by: "last_names", dir: "desc" });
    expect(parsePeopleSort("enviado", undefined)).toEqual({ by: "submitted_at", dir: "asc" });
    expect(parsePeopleSort("nombres", "raro")).toEqual({ by: "first_names", dir: "asc" });
    expect(parsePeopleSort("password_hash", "asc")).toBeUndefined();
    expect(parsePeopleSort(undefined, "asc")).toBeUndefined();
  });

  it("rechaza estados y páginas inválidos", () => {
    expect(parseStatusParam("COMPLETED")).toBe("COMPLETED");
    expect(parseStatusParam("completado")).toBeUndefined();
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("2.9")).toBe(2);
  });

  it("calcula páginas y la ventana de números", () => {
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(26, 25)).toBe(2);
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, null, 10]);
  });

  it("arma la dirección sin valores vacíos", () => {
    expect(buildQuery({ q: "ana", estado: undefined, p: 2, orden: "" })).toBe("?q=ana&p=2");
    expect(buildQuery({})).toBe("?");
  });

  it("alterna la dirección al tocar la misma columna", () => {
    expect(nextSort(undefined, "last_names")).toEqual({ by: "last_names", dir: "asc" });
    expect(nextSort({ by: "last_names", dir: "asc" }, "last_names")).toEqual({ by: "last_names", dir: "desc" });
    expect(nextSort({ by: "last_names", dir: "desc" }, "last_names")).toEqual({ by: "last_names", dir: "asc" });
    expect(nextSort({ by: "last_names", dir: "desc" }, "first_names")).toEqual({ by: "first_names", dir: "asc" });
  });
});

describe("consejo por novedad de importación", () => {
  it("dice qué hacer cuando la cédula ya existe", () => {
    expect(importRowAdvice("La cédula ya existe en la base de datos")).toMatch(/Quita la fila/);
    expect(importRowAdvice("La cédula ya existe en la base de datos")).toMatch(/ficha/);
  });

  it("distingue repetidas en el archivo y cédulas inválidas", () => {
    expect(importRowAdvice("Cédula duplicada en el archivo (fila 2)")).toMatch(/una sola fila/);
    expect(importRowAdvice("Cédula inválida: debe tener 10 dígitos y ser una cédula ecuatoriana")).toMatch(/Revisa los dígitos/);
  });

  it("no inventa nada para una novedad desconocida", () => {
    expect(importRowAdvice("Algo raro")).toMatch(/Revisa esta fila/);
  });
});
