import type { SubmissionInput } from "@/lib/validation/schemas";

export function validSubmission(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    names: { namesConfirmed: true, firstNames: "Juan Carlos", lastNames: "Pérez López" },
    contact: {
      primaryEmail: "juan@correo.com", primaryEmailConfirm: "juan@correo.com", secondaryEmail: "",
      phoneCountryCode: "+593", phoneNumber: "0991234567", addressLine1: "Av. 10 de Agosto N12-34",
      addressLine2: "", city: "Quito", province: "Pichincha", country: "Ecuador", postalCode: "",
    },
    bank: {
      bankName: "Banco Pichincha", bankOtherName: "", accountType: "Ahorros", accountNumber: "2200004821",
      accountNumberConfirm: "2200004821", accountHolderName: "Juan Carlos Pérez López",
      ownershipDeclared: true,
    },
    consents: { privacyAccepted: true, sharingAccepted: true, accuracyDeclared: true },
    noticeVersion: "1.0",
    ...overrides,
  };
}
