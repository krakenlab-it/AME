"use client";

import { useActionState, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmGeneralAction, startGeneralAction, type GeneralAccessState } from "@/app/ingresar/actions";
import { ProtectedNote } from "@/components/portal/hero";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function GeneralAccessPanel({ turnstileSiteKey, requireFingerprint }: { turnstileSiteKey: string | null; requireFingerprint: boolean }) {
  const [started, startAction, startPending] = useActionState<GeneralAccessState, FormData>(startGeneralAction, {});
  const [confirmed, confirmAction, confirmPending] = useActionState<GeneralAccessState, FormData>(confirmGeneralAction, {});
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const phase = confirmed.phase ?? started.phase ?? "identify";
  const active = phase === "identify" ? started : { ...started, ...confirmed, qrDataUrl: confirmed.qrDataUrl ?? qrDataUrl ?? started.qrDataUrl };
  const needsCaptcha = Boolean(active.requireCaptcha && turnstileSiteKey && phase === "identify");

  useEffect(() => {
    if (started.phase === "enroll" && started.qrDataUrl) setQrDataUrl(started.qrDataUrl);
    if (started.phase === "identify" || confirmed.phase === "identify") setQrDataUrl(null);
  }, [started.phase, started.qrDataUrl, confirmed.phase]);

  useEffect(() => {
    if (!needsCaptcha || document.getElementById("cf-turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [needsCaptcha]);

  return (
    <div className="sheet space-y-6 p-6 md:p-8">
      {phase === "identify" ? (
        <IdentifyStep state={active} pending={startPending} action={startAction} needsCaptcha={needsCaptcha} siteKey={turnstileSiteKey} requireFingerprint={requireFingerprint} />
      ) : (
        <TotpStep
          phase={phase}
          state={active}
          pending={confirmPending}
          action={confirmAction}
          qrDataUrl={active.qrDataUrl ?? qrDataUrl ?? undefined}
        />
      )}
      <ProtectedNote />
    </div>
  );
}

function IdentifyStep({
  state,
  pending,
  action,
  needsCaptcha,
  siteKey,
  requireFingerprint,
}: {
  state: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  needsCaptcha: boolean;
  siteKey: string | null;
  requireFingerprint: boolean;
}) {
  const cedulaError = state.fieldErrors?.cedula;
  const codeError = state.fieldErrors?.codigoDactilar;
  const banner = state.error && state.error !== "Revisa los campos marcados." ? state.error : undefined;

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">Entra con tu cédula</h2>
        <p className="text-ink-muted">
          {requireFingerprint
            ? "Escribe tu número de cédula y el código dactilar que aparece en ella. Después configuras la verificación del teléfono."
            : "Escribe tu número de cédula. El código dactilar es opcional: si lo escribes y todavía no teníamos uno, lo guardamos para las próximas veces. Después configuras la verificación del teléfono."}
        </p>
      </div>
      {banner && <Notice tone="error" live>{banner}</Notice>}
      <form action={action} className="space-y-5" noValidate>
        <Field id="cedula" label="Número de cédula" required hint="10 números, como en tu cédula." error={cedulaError}>
          <input
            id="cedula"
            name="cedula"
            className="field-input text-xl tracking-[0.12em]"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            required
            aria-invalid={Boolean(cedulaError)}
            aria-describedby={describedBy("cedula", { hint: "x", error: cedulaError })}
          />
        </Field>
        <Field
          id="codigo-dactilar"
          label="Código dactilar"
          required={requireFingerprint}
          hint={requireFingerprint ? "Una letra, 4 números, una letra y 4 números. Ejemplo: V1234V1234." : "Opcional. Una letra, 4 números, una letra y 4 números. Ejemplo: V1234V1234."}
          error={codeError}
        >
          <input
            id="codigo-dactilar"
            name="codigoDactilar"
            className="field-input text-xl uppercase tracking-[0.14em]"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required={requireFingerprint}
            aria-invalid={Boolean(codeError)}
            aria-describedby={describedBy("codigo-dactilar", { hint: "x", error: codeError })}
          />
        </Field>
        {needsCaptcha && siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-language="es" />}
        <Button type="submit" block loading={pending}>
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {pending ? "Verificando…" : "Continuar"}
        </Button>
      </form>
    </>
  );
}

function TotpStep({
  phase,
  state,
  pending,
  action,
  qrDataUrl,
}: {
  phase: "enroll" | "totp";
  state: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  qrDataUrl?: string;
}) {
  const codeError = state.fieldErrors?.code;
  const banner = state.error && state.error !== "Revisa los campos marcados." ? state.error : undefined;

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">{phase === "enroll" ? "Configura tu verificación" : "Código de verificación"}</h2>
        <p className="text-ink-muted">
          {phase === "enroll"
            ? "Abre Google Authenticator u otra aplicación compatible, escanea el código y escribe los 6 números que aparecen."
            : "Abre la aplicación con la que configuraste tu ingreso y escribe los 6 números."}
        </p>
      </div>
      {banner && <Notice tone="error" live>{banner}</Notice>}
      {phase === "enroll" && qrDataUrl && (
        <div className="flex justify-center">
          {/* El QR lleva el secreto para la app del teléfono. No se muestra como texto. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Código para agregar la cuenta en tu aplicación de verificación" width={220} height={220} className="rounded-xl border border-marian-line bg-white p-2" />
        </div>
      )}
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="phase" value={phase} />
        <Field id="totp-code" label="Código de 6 números" required error={codeError}>
          <input
            id="totp-code"
            name="code"
            className="field-input max-w-[12rem] tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            aria-invalid={Boolean(codeError)}
            aria-describedby={describedBy("totp-code", { error: codeError })}
          />
        </Field>
        <Button type="submit" block loading={pending}>
          {pending ? "Verificando…" : "Confirmar y continuar"}
        </Button>
      </form>
    </>
  );
}
