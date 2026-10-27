"use client";

import { useActionState, useRef, useState } from "react";
import { resetGeneralAuthAction } from "@/app/admin/panel-actions";
import { ConfirmDialog } from "@/components/admin/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function ResetGeneralAuth({ personId }: { personId: string }) {
  const [state, action, pending] = useActionState(resetGeneralAuthAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <form ref={formRef} action={action} className="admin-card space-y-4">
      <div className="space-y-1">
        <h2 className="section-title">Código dactilar y verificación del teléfono</h2>
        <p className="text-[15px] text-ink-muted">
          Si la persona registró un código equivocado, puedes borrarlo junto con la verificación del teléfono. Tendrá que registrarlos otra vez. Esta acción queda en la auditoría.
        </p>
      </div>
      <input type="hidden" name="personId" value={personId} />
      <Field id="reset-totp" label="Código del administrador" required hint="Confirma con la aplicación con la que entraste al panel.">
        <input id="reset-totp" name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className="field-input max-w-[12rem] tracking-[0.3em]" />
      </Field>
      <Button type="button" variant="danger" loading={pending} onClick={() => {
        if (formRef.current?.reportValidity()) setConfirming(true);
      }}>
        {pending ? "Restableciendo…" : "Restablecer código y verificación"}
      </Button>
      <ConfirmDialog
        open={confirming}
        title="¿Borrar el código y la verificación?"
        confirmLabel="Sí, restablecer"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
      >
        Se borrarán el código dactilar y la verificación del teléfono de esta persona. Tendrá que registrarlos otra vez.
      </ConfirmDialog>
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.ok && <Notice tone="success" live>Listo. La persona puede registrar de nuevo su código dactilar y la verificación.</Notice>}
    </form>
  );
}
