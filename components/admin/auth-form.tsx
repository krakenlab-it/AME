"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/admin/auth-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PasswordInput } from "@/components/ui/password-input";

export function LoginForm({ action }: { action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      <Field id="email" label="Correo electrónico" required>
        <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required className="field-input" />
      </Field>
      <Field id="password" label="Contraseña" required>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" block loading={pending}>{pending ? "Ingresando…" : "Ingresar"}</Button>
    </form>
  );
}

export function ResetRequestForm({ action }: { action: (s: AuthState, f: FormData) => Promise<AuthState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.message && <Notice tone="success" live>{state.message}</Notice>}
      <Field id="email" label="Correo electrónico" required>
        <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required className="field-input" />
      </Field>
      <Button type="submit" block loading={pending}>Enviarme el enlace</Button>
    </form>
  );
}

export function SetPasswordForm({ action, submitLabel }: { action: (s: AuthState, f: FormData) => Promise<AuthState>; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-5">
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      <Field id="password" label="Contraseña nueva" hint="Mínimo 12 caracteres, con letras y números." required>
        <PasswordInput id="password" name="password" autoComplete="new-password" aria-describedby="password-hint" required minLength={12} />
      </Field>
      <Field id="confirm" label="Repite la contraseña" required>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={12} />
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
      <Field id="code" label="Código de 6 dígitos" hint="Cambia cada 30 segundos." required>
        <input id="code" name="code" aria-describedby="code-hint" inputMode="numeric" pattern="[0-9 ]*" autoComplete="one-time-code" maxLength={7} required autoFocus className="field-input text-center text-2xl tracking-[0.4em]" />
      </Field>
      <Button type="submit" block loading={pending}>{pending ? "Verificando…" : "Verificar código"}</Button>
    </form>
  );
}
