"use client";

import { useActionState, useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { identifyAction, type IdentifyState } from "@/app/verificar/actions";
import { ProtectedNote } from "@/components/portal/hero";
import { StepCrown } from "@/components/portal/step-crown";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function IdentifyPanel({ token, turnstileSiteKey }: { token: string; turnstileSiteKey: string | null }) {
  const [state, formAction, pending] = useActionState<IdentifyState, FormData>(identifyAction, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const needsCaptcha = Boolean(state.requireCaptcha && turnstileSiteKey);

  useEffect(() => {
    if (!needsCaptcha || document.getElementById("cf-turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "cf-turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [needsCaptcha]);

  const error = state.fieldError ?? (state.error && !state.linkState ? state.error : undefined);

  useEffect(() => {
    if (error) inputRef.current?.focus();
  }, [error, state]);

  return (
    <div className="sheet space-y-6 p-6 md:p-8">
      <StepCrown current={1} />
      <div className="space-y-2">
        <h2 className="text-2xl">Confirma que eres tú</h2>
        <p className="text-ink-muted">Escribe tu número de cédula. Lo usamos para proteger tu información antes de mostrarte tus datos.</p>
      </div>

      {state.linkState ? (
        <Notice tone="error" live title="No es posible continuar con este enlace">{state.error}</Notice>
      ) : (
        <form action={formAction} className="space-y-5" noValidate>
          <input type="hidden" name="token" value={token} />
          <Field id="cedula" label="Número de cédula" required hint="10 números, sin guiones ni espacios." error={error}>
            <input
              ref={inputRef}
              id="cedula"
              name="cedula"
              className="field-input text-xl tracking-[0.12em]"
              inputMode="numeric"
              enterKeyHint="go"
              autoComplete="off"
              maxLength={12}
              pattern="[0-9 -]*"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy("cedula", { hint: "x", error })}
            />
          </Field>
          {needsCaptcha && <div className="cf-turnstile" data-sitekey={turnstileSiteKey!} data-language="es" />}
          <Button type="submit" block loading={pending}>
            <ShieldCheck className="h-5 w-5" aria-hidden />
            {pending ? "Verificando…" : "Verificar y continuar"}
          </Button>
          <p className="text-sm text-ink-muted">Si te equivocas varias veces, el enlace se desactiva por seguridad y tendrás que pedir uno nuevo.</p>
        </form>
      )}
      <ProtectedNote />
    </div>
  );
}
