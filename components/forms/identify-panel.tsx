"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { identifyAction, type IdentifyState } from "@/app/verificar/actions";
import { ProtectedNote } from "@/components/portal/hero";
import { StepCrown } from "@/components/portal/step-crown";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function IdentifyPanel({ token, turnstileSiteKey }: { token: string; turnstileSiteKey: string | null }) {
  const [started, setStarted] = useState(false);
  const [state, formAction, pending] = useActionState<IdentifyState, FormData>(identifyAction, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const needsCaptcha = Boolean(state.requireCaptcha && turnstileSiteKey);

  useEffect(() => {
    if (started) inputRef.current?.focus();
  }, [started]);

  useEffect(() => {
    if (!needsCaptcha || document.getElementById("cf-turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "cf-turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [needsCaptcha]);

  if (!started) {
    return (
      <div className="sheet space-y-5 p-6 md:p-8">
        <h2 className="text-2xl">Verificación y actualización de información</h2>
        <p className="text-ink-muted">
          Por favor verifica y completa tu información para facilitar la gestión de reclamos y reembolsos relacionados con AIG.
        </p>
        <Button block onClick={() => setStarted(true)}>Comenzar</Button>
        <ProtectedNote />
      </div>
    );
  }

  const error = state.fieldError ?? (state.error && !state.linkState ? state.error : undefined);

  return (
    <div className="sheet step-enter space-y-6 p-6 md:p-8">
      <StepCrown current={1} />
      <div>
        <h2 className="text-2xl">Identifícate</h2>
        <p className="mt-2 text-ink-muted">Para proteger tu información, confirma tu número de cédula antes de ver tus datos.</p>
      </div>

      {state.linkState ? (
        <Notice tone="error" live title="No es posible continuar con este enlace">{state.error}</Notice>
      ) : (
        <form action={formAction} className="space-y-5" noValidate>
          <input type="hidden" name="token" value={token} />
          <Field id="cedula" label="Número de cédula" required hint="10 números, sin guiones." error={error}>
            <input
              ref={inputRef}
              id="cedula"
              name="cedula"
              className="field-input tracking-[0.12em]"
              inputMode="numeric"
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
            Verificar identidad
          </Button>
          <p className="text-sm text-ink-muted">Por seguridad, después de varios intentos incorrectos el enlace se desactiva.</p>
        </form>
      )}
    </div>
  );
}
