import { describe, expect, it } from "vitest";
import { isValidCedula } from "@/lib/validation/cedula";
import { makeCedula } from "./helpers/cedula";

describe("validación de cédula ecuatoriana", () => {
  it("acepta cédulas con dígito verificador correcto", () => {
    expect(isValidCedula("1710034065")).toBe(true);
    expect(isValidCedula(makeCedula("010203040"))).toBe(true);
    expect(isValidCedula(makeCedula("300000001"))).toBe(true); // registrados en el exterior
  });
  it("rechaza dígito verificador incorrecto", () => {
    expect(isValidCedula("1710034066")).toBe(false);
  });
  it("exige exactamente 10 dígitos numéricos", () => {
    expect(isValidCedula("171003406")).toBe(false);
    expect(isValidCedula("17100340655")).toBe(false);
    expect(isValidCedula("17100340a5")).toBe(false);
    expect(isValidCedula("")).toBe(false);
  });
  it("rechaza provincia inválida", () => {
    expect(isValidCedula(makeCedula("250000001"))).toBe(false);
    expect(isValidCedula(makeCedula("000000001"))).toBe(false);
  });
  it("rechaza tercer dígito mayor o igual a 6 (no es persona natural)", () => {
    expect(isValidCedula(makeCedula("176000001"))).toBe(false);
  });
  it("ignora espacios y guiones de formato", () => {
    expect(isValidCedula("171003406-5")).toBe(true);
    expect(isValidCedula("17 1003 4065")).toBe(true);
  });
});
