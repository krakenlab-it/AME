"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Check, Lock, Mail, Pencil, UserRound } from "lucide-react";
import { submitAction } from "@/app/verificar/actions";
import { StepCrown } from "@/components/portal/step-crown";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ACCOUNT_TYPES, BANKS, BANKS_REQUIRING_NAME, EC_PROVINCES, PHONE_COUNTRY_CODES, type BankOption } from "@/lib/validation/constants";
import { submissionSchema, type Submission, type SubmissionInput } from "@/lib/validation/schemas";
import { maskAccount, maskCedulaTail } from "@/lib/security/masking";
import { cn } from "@/lib/utils";

export interface WizardProps {
  registered: { firstNames: string; lastNames: string; cedulaMasked: string; cedulaLast2: string };
  privacy: {
    version: string;
    summary: string;
    consentTexts: { PRIVACY_NOTICE: string; DATA_SHARING_AIG: string; ACCURACY_DECLARATION: string; BANK_ACCOUNT_AUTHORIZATION: string };
    responsibleLegalName: string;
    responsibleRuc: string;
    responsibleAddress: string;
    privacyEmail: string;
    privacyPhone: string;
    dataProtectionOfficer: string;
    recipientLegalName: string;
  };
  supportContact: string;
}

type Path = FieldPath<SubmissionInput>;

const STEP_FIELDS: Record<number, Path[]> = {
  2: ["names.firstNames", "names.lastNames"],
  3: [
    "contact.primaryEmail", "contact.primaryEmailConfirm", "contact.secondaryEmail", "contact.phoneCountryCode",
    "contact.phoneNumber", "contact.addressLine1", "contact.addressLine2", "contact.city", "contact.province",
    "contact.country", "contact.postalCode",
  ],
  4: [
    "bank.bankName", "bank.bankOtherName", "bank.accountType", "bank.accountNumber", "bank.accountNumberConfirm",
    "bank.accountHolderName", "bank.accountHolderCedula", "bank.ownershipDeclared",
  ],
  5: ["consents.privacyAccepted", "consents.sharingAccepted", "consents.accuracyDeclared"],
};

function stepForPath(path: string): number {
  if (path.startsWith("names")) return 2;
  if (path.startsWith("contact")) return 3;
  if (path.startsWith("bank")) return 4;
  return 5;
}

function getError(errors: unknown, path: string): string | undefined {
  let node: unknown = errors;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  const msg = (node as { message?: unknown } | undefined)?.message;
  return typeof msg === "string" ? msg : undefined;
}

export function UpdateWizard({ registered, privacy, supportContact }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(2);
  const [serverError, setServerError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<SubmissionInput, unknown, Submission>({
    resolver: zodResolver(submissionSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: {
      names: { namesConfirmed: true, firstNames: registered.firstNames, lastNames: registered.lastNames },
      contact: {
        primaryEmail: "", primaryEmailConfirm: "", secondaryEmail: "", phoneCountryCode: "+593", phoneNumber: "",
        addressLine1: "", addressLine2: "", city: "", province: "", country: "Ecuador", postalCode: "",
      },
      bank: {
        bankName: "" as BankOption, bankOtherName: "", accountType: "" as (typeof ACCOUNT_TYPES)[number],
        accountNumber: "", accountNumberConfirm: "", accountHolderName: `${registered.firstNames} ${registered.lastNames}`,
        accountHolderCedula: "", ownershipDeclared: false,
      },
      consents: { privacyAccepted: false, sharingAccepted: false, accuracyDeclared: false },
      noticeVersion: privacy.version,
    },
  });
  const { register, watch, setValue, trigger, formState, handleSubmit, setError, getValues } = form;
  const errors = formState.errors;
  const err = (p: Path) => getError(errors, p);

  const namesConfirmed = watch("names.namesConfirmed");
  const [namesDecision, setNamesDecision] = useState<"pending" | "confirmed" | "editing">("pending");
  const country = watch("contact.country");
  const bankName = watch("bank.bankName");

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function next() {
    const ok = await trigger(STEP_FIELDS[step] ?? [], { shouldFocus: true });
    if (ok) setStep((s) => Math.min(s + 1, 6));
  }

  function confirmNames() {
    setValue("names.namesConfirmed", true);
    setValue("names.firstNames", registered.firstNames);
    setValue("names.lastNames", registered.lastNames);
    setNamesDecision("confirmed");
    setStep(3);
  }

  function editNames() {
    setValue("names.namesConfirmed", false);
    setNamesDecision("editing");
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await submitAction(values);
    if (res.ok) {
      router.replace("/confirmacion");
      return;
    }
    if (res.sessionExpired) setExpired(true);
    setServerError(res.error);
    const entries = Object.entries(res.fieldErrors ?? {});
    for (const [path, message] of entries) setError(path as Path, { type: "server", message });
    if (entries[0]) setStep(stepForPath(entries[0][0]));
  });

  /** Selects controlados: evita que el valor se pierda al re-renderizar tras una validación fallida. */
  const bindSelect = (p: Path) => ({
    name: p,
    value: String(watch(p) ?? ""),
    onChange: (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
      setValue(p, e.target.value as never, { shouldDirty: true, shouldTouch: true, shouldValidate: Boolean(err(p)) }),
  });

  const input = (p: Path, extra?: string) => ({
    id: p,
    "aria-invalid": Boolean(err(p)),
    "aria-describedby": describedBy(p, { error: err(p), hint: extra }),
    className: "field-input",
  });

  if (expired) {
    return (
      <div className="sheet mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl">Tu sesión terminó</h1>
        <Notice tone="warning">{serverError}</Notice>
        <p className="text-ink-muted">Si necesitas ayuda, comunícate con {supportContact}.</p>
      </div>
    );
  }

  const v = getValues();

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-2xl space-y-6 px-5 py-8 md:py-12">
      <StepCrown current={step} />

      {serverError && <Notice tone="error" live title="No se pudo enviar">{serverError}</Notice>}

      <section key={step} className="sheet step-enter space-y-6 p-6 md:p-9" aria-labelledby="step-title">
        {/* ── Paso 2: Verificación ─────────────────────────────── */}
        {step === 2 && (
          <>
            <header className="space-y-2">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[28px]">Datos que tenemos registrados</h1>
              <p className="text-ink-muted">Revisa que tu nombre esté escrito correctamente.</p>
            </header>
            <dl className="divide-y divide-marian-line/70 rounded-xl border border-marian-line/70">
              {[["Nombres", registered.firstNames], ["Apellidos", registered.lastNames], ["Cédula", registered.cedulaMasked]].map(([k, val]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3.5">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className={cn("font-semibold", k === "Cédula" && "tracking-[0.14em]")}>{val}</dd>
                </div>
              ))}
            </dl>

            {namesDecision !== "editing" ? (
              <div className="space-y-3">
                <p className="font-serif text-lg">¿Esta información es correcta?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button type="button" onClick={confirmNames}>
                    <Check className="h-5 w-5" aria-hidden /> Sí, es correcta
                  </Button>
                  <Button type="button" variant="secondary" onClick={editNames}>
                    <Pencil className="h-5 w-5" aria-hidden /> Necesito corregirla
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <Notice tone="info">Corrige tus nombres y apellidos tal como constan en tu cédula. Guardaremos el dato anterior como respaldo.</Notice>
                <Field id="names.firstNames" label="Nombres" required error={err("names.firstNames")}>
                  <input {...input("names.firstNames")} autoComplete="given-name" {...register("names.firstNames")} />
                </Field>
                <Field id="names.lastNames" label="Apellidos" required error={err("names.lastNames")}>
                  <input {...input("names.lastNames")} autoComplete="family-name" {...register("names.lastNames")} />
                </Field>
                <p className="text-sm text-ink-muted">Si tu número de cédula es incorrecto, no continúes y comunícate con {supportContact}.</p>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => { setNamesDecision("pending"); confirmNames(); }}>Mantener los datos registrados</Button>
                  <Button type="button" onClick={next}>Continuar</Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Paso 3: Contacto y dirección ─────────────────────── */}
        {step === 3 && (
          <>
            <header className="space-y-2">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[28px]">Datos de contacto</h1>
              <p className="text-ink-muted">Los usaremos solo para comunicarnos contigo sobre tus reclamos y reembolsos.</p>
            </header>
            <div className="grid gap-5">
              <Field id="contact.primaryEmail" label="Correo electrónico principal" required error={err("contact.primaryEmail")}>
                <input {...input("contact.primaryEmail")} type="email" inputMode="email" autoComplete="email" {...register("contact.primaryEmail")} />
              </Field>
              <Field id="contact.primaryEmailConfirm" label="Confirmar correo electrónico" required error={err("contact.primaryEmailConfirm")}>
                <input {...input("contact.primaryEmailConfirm")} type="email" inputMode="email" autoComplete="off" {...register("contact.primaryEmailConfirm")} />
              </Field>
              <Field id="contact.secondaryEmail" label="Correo electrónico alternativo" error={err("contact.secondaryEmail")}>
                <input {...input("contact.secondaryEmail")} type="email" inputMode="email" autoComplete="off" {...register("contact.secondaryEmail")} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-[190px_1fr]">
                <Field id="contact.phoneCountryCode" label="Código de país" required error={err("contact.phoneCountryCode")}>
                  <select {...input("contact.phoneCountryCode")} autoComplete="tel-country-code" {...bindSelect("contact.phoneCountryCode")}>
                    {PHONE_COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </Field>
                <Field id="contact.phoneNumber" label="Teléfono celular" required error={err("contact.phoneNumber")}>
                  <input {...input("contact.phoneNumber")} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="099 123 4567" {...register("contact.phoneNumber")} />
                </Field>
              </div>
            </div>

            <h2 className="pt-2 text-xl">Dirección</h2>
            <div className="grid gap-5">
              <Field id="contact.addressLine1" label="Dirección domiciliaria" required error={err("contact.addressLine1")}>
                <input {...input("contact.addressLine1")} autoComplete="address-line1" placeholder="Calle principal, número y calle secundaria" {...register("contact.addressLine1")} />
              </Field>
              <Field id="contact.addressLine2" label="Complemento / Departamento / Referencia" error={err("contact.addressLine2")}>
                <input {...input("contact.addressLine2")} autoComplete="address-line2" {...register("contact.addressLine2")} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="contact.country" label="País" required error={err("contact.country")}>
                  <input {...input("contact.country")} autoComplete="country-name" {...register("contact.country", { onChange: () => setValue("contact.province", "") })} />
                </Field>
                <Field id="contact.province" label="Provincia" required error={err("contact.province")}>
                  {country.trim().toLowerCase() === "ecuador" ? (
                    <select key="province-select" {...input("contact.province")} autoComplete="address-level1" {...bindSelect("contact.province")}>
                      <option value="">Selecciona tu provincia</option>
                      {EC_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input key="province-text" {...input("contact.province")} autoComplete="address-level1" {...bindSelect("contact.province")} />
                  )}
                </Field>
                <Field id="contact.city" label="Ciudad" required error={err("contact.city")}>
                  <input {...input("contact.city")} autoComplete="address-level2" {...register("contact.city")} />
                </Field>
                <Field id="contact.postalCode" label="Código postal" error={err("contact.postalCode")}>
                  <input {...input("contact.postalCode")} autoComplete="postal-code" inputMode="numeric" {...register("contact.postalCode")} />
                </Field>
              </div>
            </div>
            <StepNav onBack={() => setStep(2)} onNext={next} />
          </>
        )}

        {/* ── Paso 4: Información bancaria ─────────────────────── */}
        {step === 4 && (
          <>
            <header className="space-y-2">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[28px]">Información para reembolsos</h1>
              <p className="text-ink-muted">Esta información será utilizada para procesar pagos o reembolsos relacionados con sus reclamos cuando corresponda.</p>
            </header>
            <div className="flex gap-2 text-sm text-ink-muted">
              <Lock className="h-4 w-4 shrink-0 translate-y-0.5 text-marian" aria-hidden />
              El número de cuenta se guarda cifrado y después solo se muestran los últimos 4 dígitos.
            </div>
            <div className="grid gap-5">
              <Field id="bank.bankName" label="Banco" required error={err("bank.bankName")}>
                <select {...input("bank.bankName")} {...bindSelect("bank.bankName")}>
                  <option value="">Selecciona tu banco</option>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              {BANKS_REQUIRING_NAME.includes(bankName) && (
                <Field id="bank.bankOtherName" label={bankName === "Cooperativa" ? "Nombre de la cooperativa" : "Nombre de la institución financiera"} required error={err("bank.bankOtherName")}>
                  <input {...input("bank.bankOtherName")} autoComplete="off" {...register("bank.bankOtherName")} />
                </Field>
              )}
              <fieldset className="space-y-2">
                <legend className="text-[15px] font-semibold">Tipo de cuenta <span className="text-alert" aria-hidden>*</span></legend>
                <div className="grid grid-cols-2 gap-3">
                  {ACCOUNT_TYPES.map((t) => (
                    <label key={t} className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-ink-faint/60 bg-white px-4 has-[:checked]:border-marian has-[:checked]:bg-marian-soft/60">
                      <input type="radio" value={t} className="h-5 w-5 accent-marian" {...register("bank.accountType")} />
                      {t}
                    </label>
                  ))}
                </div>
                {err("bank.accountType") && <p role="alert" className="text-sm font-medium text-alert">{err("bank.accountType")}</p>}
              </fieldset>
              <Field id="bank.accountNumber" label="Número de cuenta" required hint="Solo números, sin espacios ni guiones." error={err("bank.accountNumber")}>
                <input {...input("bank.accountNumber", "hint")} inputMode="numeric" autoComplete="off" spellCheck={false} {...register("bank.accountNumber")} />
              </Field>
              <Field id="bank.accountNumberConfirm" label="Confirmar número de cuenta" required error={err("bank.accountNumberConfirm")}>
                <input {...input("bank.accountNumberConfirm")} inputMode="numeric" autoComplete="off" spellCheck={false} {...register("bank.accountNumberConfirm")} />
              </Field>
              <Field id="bank.accountHolderName" label="Nombre del titular de la cuenta" required error={err("bank.accountHolderName")}>
                <input {...input("bank.accountHolderName")} autoComplete="off" {...register("bank.accountHolderName")} />
              </Field>
              <Field id="bank.accountHolderCedula" label="Cédula del titular" required error={err("bank.accountHolderCedula")}>
                <input {...input("bank.accountHolderCedula")} inputMode="numeric" autoComplete="off" maxLength={12} {...register("bank.accountHolderCedula")} />
              </Field>
              <Checkbox id="bank.ownershipDeclared" error={err("bank.ownershipDeclared")} label={privacy.consentTexts.BANK_ACCOUNT_AUTHORIZATION} registration={register("bank.ownershipDeclared")} />
            </div>
            <StepNav onBack={() => setStep(3)} onNext={next} />
          </>
        )}

        {/* ── Paso 5: Privacidad y consentimiento ──────────────── */}
        {step === 5 && (
          <>
            <header className="space-y-2">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[28px]">Privacidad y protección de datos</h1>
              <p className="text-ink-muted">Lee este resumen antes de dar tu autorización.</p>
            </header>
            <div className="max-h-72 overflow-y-auto rounded-xl border border-marian-line/70 bg-paper px-5 py-4 font-serif text-[15.5px] leading-[1.7]" tabIndex={0} aria-label="Resumen del Aviso de Privacidad">
              {privacy.summary.split(/\n{2,}/).map((p, i) => (
                <p key={i} className={cn("mb-3", i === 0 && "font-semibold")}>{p}</p>
              ))}
            </div>
            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-marian-soft/50 px-5 py-4 text-[15px] sm:grid-cols-2">
              <Row k="Responsable del tratamiento" v={privacy.responsibleLegalName} />
              <Row k="RUC" v={privacy.responsibleRuc} />
              <Row k="Dirección" v={privacy.responsibleAddress} />
              <Row k="Correo de privacidad" v={privacy.privacyEmail} />
              <Row k="Teléfono" v={privacy.privacyPhone} />
              {privacy.dataProtectionOfficer && <Row k="Delegado de Protección de Datos" v={privacy.dataProtectionOfficer} />}
              <Row k="Destinatario de la información" v={privacy.recipientLegalName} />
              <Row k="Versión del aviso" v={privacy.version} />
            </dl>
            <div className="space-y-4">
              <Checkbox id="consents.privacyAccepted" error={err("consents.privacyAccepted")} label={privacy.consentTexts.PRIVACY_NOTICE} registration={register("consents.privacyAccepted")} />
              <Checkbox id="consents.sharingAccepted" error={err("consents.sharingAccepted")} label={privacy.consentTexts.DATA_SHARING_AIG} registration={register("consents.sharingAccepted")} />
              <Checkbox id="consents.accuracyDeclared" error={err("consents.accuracyDeclared")} label={privacy.consentTexts.ACCURACY_DECLARATION} registration={register("consents.accuracyDeclared")} />
            </div>
            <p className="text-[15px] text-ink-muted">
              Puede consultar el Aviso de Privacidad completo antes de continuar.{" "}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-semibold text-marian underline underline-offset-4">
                Leer Aviso de Privacidad completo
              </a>
            </p>
            <StepNav onBack={() => setStep(4)} onNext={next} />
          </>
        )}

        {/* ── Paso 6: Revisión ─────────────────────────────────── */}
        {step === 6 && (
          <>
            <header className="space-y-2">
              <h1 id="step-title" ref={headingRef} tabIndex={-1} className="text-[28px]">Revisa tu información</h1>
              <p className="text-ink-muted">Confirma que todo esté correcto antes de enviar.</p>
            </header>
            <ReviewCard icon={UserRound} title="Datos personales" onEdit={() => setStep(2)}>
              <Row k="Nombres" v={namesConfirmed ? registered.firstNames : v.names.firstNames} />
              <Row k="Apellidos" v={namesConfirmed ? registered.lastNames : v.names.lastNames} />
              <Row k="Cédula" v={maskCedulaTail(registered.cedulaLast2)} />
            </ReviewCard>
            <ReviewCard icon={Mail} title="Contacto" onEdit={() => setStep(3)}>
              <Row k="Correo" v={v.contact.primaryEmail} />
              {v.contact.secondaryEmail && <Row k="Correo alternativo" v={v.contact.secondaryEmail} />}
              <Row k="Teléfono" v={`${v.contact.phoneCountryCode} ${v.contact.phoneNumber}`} />
              <Row k="Dirección" v={[v.contact.addressLine1, v.contact.addressLine2, v.contact.city, v.contact.province, v.contact.country].filter(Boolean).join(", ")} />
            </ReviewCard>
            <ReviewCard icon={Building2} title="Información bancaria" onEdit={() => setStep(4)}>
              <Row k="Banco" v={BANKS_REQUIRING_NAME.includes(v.bank.bankName) ? `${v.bank.bankName}: ${v.bank.bankOtherName}` : v.bank.bankName} />
              <Row k="Tipo de cuenta" v={v.bank.accountType} />
              <Row k="Cuenta" v={maskAccount(v.bank.accountNumber.slice(-4))} />
              <Row k="Titular" v={v.bank.accountHolderName} />
            </ReviewCard>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep(5)}>Editar</Button>
              <Button type="submit" loading={formState.isSubmitting}>Continuar y enviar</Button>
            </div>
          </>
        )}
      </section>

      <p className="text-center text-sm text-ink-muted">
        <Lock className="mr-1 inline h-4 w-4 text-marian" aria-hidden />
        Por seguridad, tu sesión se cierra después de 30 minutos. Tus respuestas no se guardan en este dispositivo.
      </p>
    </form>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
      <Button type="button" variant="ghost" onClick={onBack}>Volver</Button>
      <Button type="button" onClick={onNext}>Continuar</Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 py-1 sm:block">
      <dt className="text-sm text-ink-muted">{k}</dt>
      <dd className="break-words font-medium">{v}</dd>
    </div>
  );
}

function ReviewCard({ icon: Icon, title, onEdit, children }: { icon: typeof Mail; title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-marian-line/70 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-marian" aria-hidden />{title}</h2>
        <button type="button" onClick={onEdit} className="min-h-[44px] rounded-lg px-3 text-[15px] font-semibold text-marian hover:bg-marian-soft">
          Editar<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function Checkbox({ id, label, error, registration }: { id: string; label: string; error?: string; registration: UseFormRegisterReturn }) {
  return (
    <div>
      <label htmlFor={id} className={cn("flex cursor-pointer gap-3 rounded-xl border bg-white p-4 text-[15.5px] leading-snug", error ? "border-alert" : "border-marian-line has-[:checked]:border-marian has-[:checked]:bg-marian-soft/40")}>
        <input id={id} type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-marian" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} {...registration} />
        <span>{label}</span>
      </label>
      {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-alert">{error}</p>}
    </div>
  );
}
