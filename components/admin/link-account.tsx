"use client";

import { useActionState } from "react";
import { linkAccountAction } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function LinkAccount({ accountId, requestedLast2 }: { accountId: string; requestedLast2: string | null }) {
  const [state, action, pending] = useActionState(linkAccountAction, {});
  if (state.ok) return <Notice tone="success" live>Cuenta vinculada.</Notice>;

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <label className="space-y-1 text-sm">
        <span className="block font-semibold">Cédula</span>
        <input
          name="cedula"
          inputMode="numeric"
          autoComplete="off"
          maxLength={16}
          placeholder={requestedLast2 ? `Vacío = la pedida (…${requestedLast2})` : "Cédula de la persona"}
          required={!requestedLast2}
          className="field-input !min-h-[44px] w-56 !py-2 text-sm"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-semibold">Código del administrador</span>
        <input name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className="field-input !min-h-[44px] w-36 !py-2 text-sm tracking-[0.3em]" />
      </label>
      <Button type="submit" loading={pending} onClick={(event) => {
        if (!confirm("La cuenta quedará vinculada a esa persona y entrará a su formulario. ¿Continuar?")) event.preventDefault();
      }}>
        {pending ? "Vinculando…" : "Vincular"}
      </Button>
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
    </form>
  );
}
