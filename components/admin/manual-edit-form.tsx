"use client";

import { useActionState } from "react";
import { QrCode } from "lucide-react";
import { manualEditAction, type ManualEditState } from "@/app/admin/panel-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export interface ManualContactValues {
  primaryEmail: string;
  secondaryEmail: string;
  mobilePhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
}

export function ManualEditForm({
  personId,
  firstNames,
  lastNames,
  outreachEmail,
  contact,
  verificationQr,
}: {
  personId: string;
  firstNames: string;
  lastNames: string;
  outreachEmail: string;
  contact: ManualContactValues | null;
  verificationQr?: string | null;
}) {
  const [state, action, pending] = useActionState<ManualEditState, FormData>(manualEditAction, {});

  return (
    <form action={action} className="sheet space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="text-lg">Cambio manual</h2>
        <p className="text-[15px] text-ink-muted">
          Antes de guardar, confirme su identidad con la misma aplicación autenticadora (código QR) que usa para ingresar al panel. La auditoría registrará su usuario y los campos modificados.
        </p>
      </div>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="hasContact" value={contact ? "1" : "0"} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="edit-first" label="Nombres" required>
          <input id="edit-first" name="firstNames" defaultValue={firstNames} required minLength={2} maxLength={80} className="field-input" />
        </Field>
        <Field id="edit-last" label="Apellidos" required>
          <input id="edit-last" name="lastNames" defaultValue={lastNames} required minLength={2} maxLength={80} className="field-input" />
        </Field>
      </div>
      <Field id="edit-outreach" label="Correo para el enlace" hint="Opcional. Se guarda en la ficha para referencia al enviar el enlace por otro medio.">
        <input id="edit-outreach" name="outreachEmail" type="email" defaultValue={outreachEmail} maxLength={254} className="field-input" aria-describedby="edit-outreach-hint" />
      </Field>
      {contact && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="edit-email" label="Correo principal" required>
            <input id="edit-email" name="primaryEmail" type="email" defaultValue={contact.primaryEmail} required className="field-input" />
          </Field>
          <Field id="edit-email-2" label="Correo alternativo">
            <input id="edit-email-2" name="secondaryEmail" type="email" defaultValue={contact.secondaryEmail} className="field-input" />
          </Field>
          <Field id="edit-phone" label="Celular" required hint="Formato internacional, por ejemplo +593991234567.">
            <input id="edit-phone" name="mobilePhone" defaultValue={contact.mobilePhone} required className="field-input" aria-describedby="edit-phone-hint" />
          </Field>
          <Field id="edit-city" label="Ciudad" required>
            <input id="edit-city" name="city" defaultValue={contact.city} required className="field-input" />
          </Field>
          <Field id="edit-address" label="Dirección" required className="sm:col-span-2">
            <input id="edit-address" name="addressLine1" defaultValue={contact.addressLine1} required className="field-input" />
          </Field>
          <Field id="edit-address-2" label="Dirección (línea 2)" className="sm:col-span-2">
            <input id="edit-address-2" name="addressLine2" defaultValue={contact.addressLine2} className="field-input" />
          </Field>
          <Field id="edit-province" label="Provincia" required>
            <input id="edit-province" name="province" defaultValue={contact.province} required className="field-input" />
          </Field>
          <Field id="edit-country" label="País" required>
            <input id="edit-country" name="country" defaultValue={contact.country || "Ecuador"} required className="field-input" />
          </Field>
          <Field id="edit-postal" label="Código postal">
            <input id="edit-postal" name="postalCode" defaultValue={contact.postalCode} className="field-input" />
          </Field>
        </div>
      )}

      <section aria-labelledby="manual-qr-title" className="rounded-xl border border-marian-line bg-marian-soft/40 p-4">
        <div className="flex items-start gap-3">
          <QrCode className="mt-0.5 h-6 w-6 shrink-0 text-marian" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <h3 id="manual-qr-title" className="font-semibold">Verificación con código QR</h3>
            <p className="text-sm text-ink-muted">
              Abra su aplicación autenticadora, confirme que ve el acceso del portal y escriba el código de 6 dígitos. Sin este paso no se guarda el cambio.
            </p>
            {verificationQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={verificationQr} alt="Código QR de su aplicación autenticadora para confirmar el cambio manual" width={200} height={200} className="rounded-lg border border-marian-line bg-white" />
            ) : (
              <p className="text-sm text-ink-muted">Use la misma aplicación con la que ingresó al panel (Google Authenticator, Microsoft Authenticator, 1Password, etc.).</p>
            )}
            <Field id="edit-totp" label="Código de verificación" required hint="Código de 6 dígitos tras revisar su aplicación.">
              <input id="edit-totp" name="totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className="field-input max-w-[12rem] tracking-[0.3em]" aria-describedby="edit-totp-hint" />
            </Field>
          </div>
        </div>
      </section>

      <Button type="submit" loading={pending}>{pending ? "Verificando…" : "Guardar cambio manual"}</Button>
      {state.error && <Notice tone="error" live>{state.error}</Notice>}
      {state.ok && <Notice tone="success" live>Cambio guardado. Quedó en la auditoría con su usuario.</Notice>}
    </form>
  );
}
