import { beforeEach, describe, expect, it } from "vitest";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import type { InsuredRecord, NoticeRecord } from "@/lib/database/types";
import { pickDemoAccount } from "@/lib/demo/enter";
import { maskAccount, maskCedula, maskEmail } from "@/lib/security/masking";
import { canContinueForm, composeInsuredHome } from "@/lib/services/insured-home";
import { getRespondentContext, identify, openInsuredHome } from "@/lib/services/respondent";
import { makeCedula } from "./helpers/cedula";

const JUAN = "1710034065";
const MARIA = makeCedula("010203040");
const deps = (ipHash = "ip-home") => ({ ipHash, captchaEnabled: false, verifyCaptcha: async () => true });

const notice = (version: string): Pick<NoticeRecord, "version"> => ({ version });

function recordFor(repo: MemoryRepo, personId: string, extras: Partial<InsuredRecord> = {}): InsuredRecord {
  const person = repo.people.get(personId)!;
  return {
    person: { ...person, review_reasons: person.review_reasons },
    contact: null,
    bank: null,
    notice_version: null,
    ...extras,
  };
}

let repo: MemoryRepo;
let juanId: string;
let mariaId: string;
let juanToken: string;

beforeEach(() => {
  repo = new MemoryRepo();
  juanId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
  mariaId = repo.addPerson("María José", "Andrade Vega", MARIA);
  juanToken = randomToken();
  repo.addToken(juanId, sha256(juanToken));
});

describe("mi cuenta del asegurado", () => {
  it("arma avisos de estado y del aviso vigente, sin tabla nueva", () => {
    const home = composeInsuredHome(recordFor(repo, juanId), notice("1.0"));
    expect(home.statusLabel).toBe("Pendiente");
    expect(home.editable).toBe(true);
    expect(home.confirmationCode).toBeNull();
    expect(home.notifications.map((item) => item.title)).toEqual(["Pendiente", "Aviso de privacidad vigente"]);
    expect(home.cedulaMasked).toBe(maskCedula(JUAN));
    expect(home.cedulaMasked).not.toContain(JUAN.slice(2, 8));
  });

  it("en revisión explica el motivo y avisa si el aviso de privacidad cambió", () => {
    const person = repo.people.get(juanId)!;
    person.status = "NEEDS_REVIEW";
    person.submitted_at = "2026-09-21T15:28:00.000Z";
    person.confirmation_code = "AIG-K2N6RVW3";
    person.review_reasons = ["NAMES_CORRECTED", "THIRD_PARTY_ACCOUNT"];
    const home = composeInsuredHome(
      recordFor(repo, juanId, {
        contact: {
          primary_email: "juan@example.invalid",
          secondary_email: null,
          mobile_phone: "+593991234567",
          city: "Quito",
          province: "Pichincha",
          country: "Ecuador",
        },
        bank: {
          bank_name: "Banco Pichincha",
          bank_other_name: null,
          account_type: "Ahorros",
          account_number_last4: "4821",
          holder_is_titular: false,
        },
        notice_version: "1.0",
      }),
      notice("1.1"),
    );
    expect(home.editable).toBe(false);
    expect(home.confirmationCode).toBe("AIG-K2N6RVW3");
    expect(home.contact?.email).toBe(maskEmail("juan@example.invalid"));
    expect(home.contact?.email).not.toBe("juan@example.invalid");
    expect(home.contact?.place).toBe("Quito, Pichincha, Ecuador");
    expect(home.bank?.accountMasked).toBe(maskAccount("4821"));
    expect(home.bank?.ownership).toBe("Cuenta de un tercero");
    expect(JSON.stringify(home)).not.toContain("991234567");
    const titles = home.notifications.map((item) => item.title);
    expect(titles).toContain("En revisión");
    expect(titles).toContain("Hay un aviso de privacidad nuevo");
    expect(home.notifications.find((item) => item.id === "status-review")?.body).toContain("corrigió nombres");
  });

  it("un enlace ya usado abre la cuenta de esa persona y no el formulario", async () => {
    const person = repo.people.get(juanId)!;
    person.status = "COMPLETED";
    person.submitted_at = "2026-09-21T15:28:00.000Z";
    person.confirmation_code = "AIG-TESTCODE";
    const used = randomToken();
    repo.addToken(juanId, sha256(used), { used_at: person.submitted_at });

    expect(await identify(repo, { token: used, cedula: JUAN }, deps())).toMatchObject({ ok: false, linkState: "used" });
    const opened = await openInsuredHome(repo, { token: used, cedula: JUAN }, deps("otra-ip"));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(await getRespondentContext(repo, opened.sessionToken)).toBeNull();
    const ctx = await getRespondentContext(repo, opened.sessionToken, { allowSubmitted: true });
    expect(ctx?.person.id).toBe(juanId);
    expect(ctx?.person.id).not.toBe(mariaId);
    expect(canContinueForm(ctx!.person)).toBe(false);

    const wrong = await openInsuredHome(repo, { token: used, cedula: MARIA }, deps("ip-ajena"));
    expect(wrong.ok).toBe(false);
  });

  it("no deja consultar la cuenta de otra persona con su cédula y el enlace de Juan", async () => {
    const opened = await openInsuredHome(repo, { token: juanToken, cedula: MARIA }, deps());
    expect(opened.ok).toBe(false);
    const own = await openInsuredHome(repo, { token: juanToken, cedula: JUAN }, deps("ip-juan"));
    expect(own.ok).toBe(true);
    if (!own.ok) return;
    const ctx = await getRespondentContext(repo, own.sessionToken, { allowSubmitted: true });
    const record = await repo.getInsuredRecord(ctx!.person.id);
    expect(record?.person.id).toBe(juanId);
    expect(record?.person.id).not.toBe(mariaId);
  });

  it("la puerta de demostración elige un registro ya enviado", () => {
    const people = [
      { id: "camino", status: "STARTED" as const, submitted_at: null, first_names: "Lucía", last_names: "Paz" },
      { id: "listo", status: "COMPLETED" as const, submitted_at: "2026-09-21", first_names: "Camila", last_names: "Paz" },
      { id: "revision", status: "NEEDS_REVIEW" as const, submitted_at: "2026-09-23", first_names: "Andrés", last_names: "Paz" },
    ];
    expect(pickDemoAccount(people)?.id).toBe("listo");
  });
});
