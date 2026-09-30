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

export function ResetRequestForm({ action }: { action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.message && <Notice tone="success" live>{state.message}</Notice>}
      <Field id="email" label="Correo" required>
        <input id="email" name="email" type="email" autoComplete="username" required className="field-input" />
      </Field>
      <Button type="submit" block loading={pending}>Enviar enlace</Button>
    </form>
  );
}

export function SetPasswordForm({ action, submitLabel }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      <Field id="password" label="Contraseña nueva" hint="Mínimo 12 caracteres, con letras y números." required>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className="field-input" />
      </Field>
      <Field id="confirm" label="Repite la contraseña" required>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="field-input" />
      </Field>
      <Button type="submit" block loading={pending}>{submitLabel}</Button>
    </form>
  );
}

export function MfaForm({ action, factorId }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; factorId?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <Field id="code" label="Código de 6 dígitos" required>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus className="field-input text-center text-2xl tracking-[0.4em]" />
      </Field>
      <Button type="submit" block loading={pending}>Verificar</Button>
    </form>
  );
}
