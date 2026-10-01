"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { identifyByCedulaAction, type IdentifyState } from "@/app/verificar/actions";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";

export function CedulaCta({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <Button type="button" size="sm" block onClick={() => setOpen(true)}>
        Haz clic aquí
      </Button>
    );
  }

  return (
    <div className="space-y-4 border-t border-marian/15 pt-3">
      <p className="text-[15px] text-ink">Si ya te importaron al portal, escribe tu cédula para retomar la actualización.</p>
      {state.linkState ? (
        <p className="text-sm text-alert" role="alert">{state.error}</p>
      ) : (
        <form action={formAction} className="space-y-4" noValidate>
          <Field id="landing-cedula" label="Número de cédula" required hint="10 números, sin guiones ni espacios." error={error}>
            <input
              ref={inputRef}
              id="landing-cedula"
              name="cedula"
              className="field-input text-lg tracking-[0.12em]"
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
          {needsCaptcha && <div className="cf-turnstile" data-sitekey={turnstileSiteKey!} data-language="es" />}
          <Button type="submit" size="sm" block loading={pending}>
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {pending ? "Verificando…" : "Continuar"}
          </Button>
        </form>
      )}
    </div>
  );
}
