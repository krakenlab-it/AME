"use client";

import { useActionState, useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { identifyByCedulaAction, type IdentifyState } from "@/app/verificar/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";

export function CedulaCta({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, formAction, pending] = useActionState<IdentifyState, FormData>(identifyByCedulaAction, {});
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
    <div className="w-full space-y-4 text-center">
      {state.linkState ? (
        <p className="text-center text-sm text-alert" role="alert">{state.error}</p>
      ) : (
        <form action={formAction} className="w-full space-y-4" noValidate>
          <Field
            id="landing-cedula"
            label="Digita su número de cédula para empezar"
            required
            hint="10 números, sin guiones ni espacios."
            error={error}
            className="w-full"
            textAlign="landing"
          >
            <input
              ref={inputRef}
              id="landing-cedula"
              name="cedula"
              className="field-input w-full text-center text-lg tracking-[0.12em] placeholder:text-center"
              placeholder="Digite su número de cédula"
              inputMode="numeric"
              enterKeyHint="go"
              autoComplete="off"
              maxLength={12}
              pattern="[0-9 -]*"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy("landing-cedula", { hint: "x", error })}
            />
          </Field>
          {needsCaptcha && <div className="cf-turnstile flex justify-center" data-sitekey={turnstileSiteKey!} data-language="es" />}
          <Button type="submit" block loading={pending} className="w-full">
            <ShieldCheck className="h-5 w-5" aria-hidden />
            {pending ? "Verificando…" : "Continuar"}
          </Button>
        </form>
      )}
    </div>
  );
}
