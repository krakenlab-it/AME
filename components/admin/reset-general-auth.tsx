"use client";

import { useActionState } from "react";
import { resetGeneralAuthAction } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function ResetGeneralAuth({ personId }: { personId: string }) {
  const [state, action, pending] = useActionState(resetGeneralAuthAction, {});

  return (
    <form action={action} className="sheet space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="text-lg">Código dactilar y verificación del teléfono</h2>
        <p className="text-[15px] text-ink-muted">
          Si la persona registró un código equivocado, puedes borrarlo junto con la verificación del teléfono. Tendrá que registrarlos otra vez. Esta acción queda en la auditoría.
        </p>
      </div>
      <input type="hidden" name="personId" value={personId} />
      <Field id="reset-totp" label="Código del administrador" required hint="Confirma con la aplicación con la que entraste al panel.">
        <input id="reset-totp" name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className="field-input max-w-[12rem] tracking-[0.3em]" />
      </Field>
      <Button type="submit" variant="danger" loading={pending} onClick={(event) => {
        if (!confirm("Se borrarán el código dactilar y la verificación del teléfono de esta persona. ¿Continuar?")) event.preventDefault();
      }}>
        {pending ? "Restableciendo…" : "Restablecer código y verificación"}
      </Button>
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.ok && <Notice tone="success" live>Listo. La persona puede registrar de nuevo su código dactilar y la verificación.</Notice>}
    </form>
  );
}
