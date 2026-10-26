"use client";

import { useActionState } from "react";
import { deletePersonAction, resetPersonToGuestAction } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

function ConfirmFields({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <Field id={`${idPrefix}-reason`} label="Motivo" required hint="Queda en la auditoría. No escriba la cédula completa.">
        <input id={`${idPrefix}-reason`} name="reason" required minLength={3} maxLength={200} className="field-input" />
      </Field>
      <Field id={`${idPrefix}-totp`} label="Código del administrador" required hint="Confirma con la aplicación con la que entraste al panel.">
        <input id={`${idPrefix}-totp`} name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className="field-input max-w-[12rem] tracking-[0.3em]" />
      </Field>
    </>
  );
}

export function PersonLifecycleActions({ personId }: { personId: string }) {
  const [resetState, resetAction, resetPending] = useActionState(resetPersonToGuestAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState(deletePersonAction, {});

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form action={resetAction} className="sheet space-y-4 border border-alert/40 p-5">
        <div className="space-y-1">
          <h2 className="text-lg">Restablecer a invitado</h2>
          <p className="text-[15px] text-ink-muted">
            Borra respuestas, consentimientos, código dactilar, verificación, sesiones y enlaces. La ficha y el correo de precarga se quedan, para que la persona vuelva a ingresar.
          </p>
        </div>
        <input type="hidden" name="personId" value={personId} />
        <ConfirmFields idPrefix="reset-guest" />
        <Field id="reset-guest-confirm" label="Escribe RESTABLECER" required>
          <input id="reset-guest-confirm" name="confirm" required autoComplete="off" className="field-input max-w-[16rem] uppercase tracking-widest" />
        </Field>
        <Button type="submit" variant="danger" loading={resetPending}>
          {resetPending ? "Restableciendo…" : "Restablecer a invitado"}
        </Button>
        {resetState.error && <Notice tone="error" live>{resetState.error}</Notice>}
        {resetState.ok && <Notice tone="success" live>Listo. La persona puede volver a hacer el ingreso.</Notice>}
      </form>

      <form action={deleteAction} className="sheet space-y-4 border border-alert/40 p-5">
        <div className="space-y-1">
          <h2 className="text-lg">Eliminar persona</h2>
          <p className="text-[15px] text-ink-muted">
            Borra la ficha y lo que depende de ella. Un registro ya enviado, todavía dentro del plazo de conservación, no se puede eliminar: use restablecer, o espere la anonimización.
          </p>
        </div>
        <input type="hidden" name="personId" value={personId} />
        <ConfirmFields idPrefix="delete-person" />
        <Field id="delete-person-confirm" label="Escribe ELIMINAR" required>
          <input id="delete-person-confirm" name="confirm" required autoComplete="off" className="field-input max-w-[16rem] uppercase tracking-widest" />
        </Field>
        <Button type="submit" variant="danger" loading={deletePending}>
          {deletePending ? "Eliminando…" : "Eliminar persona"}
        </Button>
        {deleteState.error && <Notice tone="error" live>{deleteState.error}</Notice>}
      </form>
    </div>
  );
}
