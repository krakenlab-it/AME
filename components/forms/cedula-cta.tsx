"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { identifyByCedulaAction, type IdentifyState } from "@/app/verificar/actions";
import { Button } from "@/components/ui/button";
import { describedBy } from "@/components/ui/field";

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
    <div className="landing-cedula-field w-full space-y-4">
      {state.linkState ? (
        <p className="w-full text-center text-sm text-alert" role="alert">{state.error}</p>
      ) : (
        <form action={formAction} className="w-full space-y-4" noValidate>
          <div className="space-y-1.5">
            <label
              htmlFor="landing-cedula"
              className="landing-cedula-label block w-full text-center text-[15px] font-semibold leading-snug text-ink"
            >
              Digita su número de cédula para empezar
              <span className="text-alert" aria-hidden> *</span>
              <span className="sr-only"> (obligatorio)</span>
            </label>
            <p id="landing-cedula-hint" className="landing-cedula-hint w-full text-center text-sm text-ink-muted">
              10 números, sin guiones ni espacios.
            </p>
            <input
              ref={inputRef}
              id="landing-cedula"
              name="cedula"
              className="landing-cedula-input field-input w-full text-center text-[17px] placeholder:text-center placeholder:tracking-normal"
              placeholder="Número de cédula"
              inputMode="numeric"
              enterKeyHint="go"
              autoComplete="off"
              maxLength={12}
              pattern="[0-9 -]*"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy("landing-cedula", { hint: "x", error })}
            />
            {error && (
              <p id="landing-cedula-error" role="alert" className="flex w-full items-center justify-center gap-1.5 text-center text-sm font-medium text-alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </p>
            )}
          </div>
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
