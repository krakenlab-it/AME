import { describe, expect, it } from "vitest";
import { assessNationalId } from "@/lib/validation/document";
import { isValidCedula } from "@/lib/validation/cedula";
import { makeCedula } from "./helpers/cedula";

describe("documento de identidad", () => {
  it("sigue exigiendo el verificador de la cédula ecuatoriana", () => {
    const cedula = makeCedula("171003406");
    expect(isValidCedula(cedula)).toBe(true);
    expect(assessNationalId(cedula)).toEqual({ ok: true, kind: "cedula", value: cedula });
    expect(assessNationalId("171003406-5")).toMatchObject({ ok: true, kind: "cedula", value: "1710034065" });
    expect(assessNationalId("1234567890").ok).toBe(false);
    expect(assessNationalId("17100340A5").ok).toBe(false);
    expect(assessNationalId("86520").ok).toBe(false);
    expect(assessNationalId("").ok).toBe(false);
    expect(assessNationalId("AAAAAA").ok).toBe(false);
  });

  it("acepta los pasaportes del archivo inicial y los normaliza", () => {
    expect(assessNationalId("BH823158")).toEqual({ ok: true, kind: "foreign", value: "BH823158" });
    expect(assessNationalId("ba 086520")).toEqual({ ok: true, kind: "foreign", value: "BA086520" });
    expect(assessNationalId("bh-823158")).toEqual({ ok: true, kind: "foreign", value: "BH823158" });
  });
});
