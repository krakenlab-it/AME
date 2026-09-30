"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/admin/auth-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function LoginForm({ action }: { action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      <Field id="email" label="Correo" required>
        <input id="email" name="email" type="email" autoComplete="username" required className="field-input" />
      </Field>
      <Field id="password" label="Contraseña" required>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field-input" />
      </Field>
      <Button type="submit" block loading={pending}>Ingresar</Button>
    </form>
  );
}

export function MfaForm({ action }: { action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      <Field id="code" label="Código de 6 dígitos" required>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus className="field-input text-center text-2xl tracking-[0.4em]" />
      </Field>
      <Button type="submit" block loading={pending}>Verificar</Button>
    </form>
  );
}
