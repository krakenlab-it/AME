"use client";

import { useActionState, useEffect, useState } from "react";
import { inviteStaffAction, type InviteStaffState } from "@/app/admin/invite-actions";
import { ROLE_LABELS, ROLE_SCOPE } from "@/lib/admin/labels";
import { ADMIN_ROLES } from "@/lib/security/rbac";
import { Button } from "@/components/ui/button";
import { Field, RequiredLegend } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState<InviteStaffState, FormData>(inviteStaffAction, {});
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    setCopied(false);
    setCopyError(false);
  }, [state.confirmUrl]);

  const copyLink = async () => {
    if (!state.confirmUrl) return;
    try {
      await navigator.clipboard.writeText(state.confirmUrl);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  };

  return (
    <form action={formAction} className="sheet space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-xl">Invitar al panel</h2>
        <p className="text-[15px] text-ink-muted">
          La persona recibe un correo, elige su contraseña y luego configura la verificación del teléfono. No hay registro público.
          El rol define qué puede hacer cuando entre.
        </p>
      </div>
      <RequiredLegend />
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.ok && state.emailed && (
        <Notice tone="success" live>
          Enviamos la invitación a {state.email}. Al abrirla elegirá su contraseña en el registro y configurará la verificación en dos pasos.
          {state.role ? ` Rol asignado: ${ROLE_LABELS[state.role]}.` : ""}
        </Notice>
      )}
      {state.ok && state.confirmUrl && (
        <Notice tone="success" live title="Correo ya existente en el acceso">
          Ese correo ya existía, pero no estaba vinculado al panel. Copia el enlace de un solo uso y entrégalo a la persona.
          No lo reenvíes en masa. Después elegirá su contraseña y configurará la verificación del teléfono.
          {state.role ? ` Rol asignado: ${ROLE_LABELS[state.role]}.` : ""}
        </Notice>
      )}
      {state.ok && !state.emailed && !state.confirmUrl && (
        <Notice tone="warning" live>
          La persona quedó vinculada al panel, pero no hay un enlace para copiar. Pídele que use la recuperación de contraseña.
        </Notice>
      )}
      {state.confirmUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-marian-line bg-white p-3">
          <code className="min-w-0 flex-1 break-all text-sm">{state.confirmUrl}</code>
          <Button variant="secondary" size="sm" type="button" onClick={copyLink}>{copied ? "Copiado" : "Copiar enlace"}</Button>
        </div>
      )}
      {copyError && <Notice tone="warning" live>No pudimos copiar automáticamente. Selecciona el enlace y cópialo a mano.</Notice>}
      <Field id="full_name" label="Nombre completo" required hint="Como debe aparecer en el panel.">
        <input id="full_name" name="full_name" autoComplete="name" required minLength={2} maxLength={120} className="field-input" aria-describedby="full_name-hint" />
      </Field>
      <Field id="email" label="Correo electrónico" required>
        <input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required className="field-input" />
      </Field>
      <Field id="role" label="Rol en el panel" required hint="Los tres entran al mismo panel. Cambia lo que pueden hacer.">
        <select id="role" name="role" required defaultValue="ADMIN" className="field-input" aria-describedby="role-hint">
          {ADMIN_ROLES.map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role]} — {ROLE_SCOPE[role]}</option>
          ))}
        </select>
      </Field>
      <Button type="submit" loading={pending}>{pending ? "Enviando invitación…" : "Enviar invitación"}</Button>
    </form>
  );
}
