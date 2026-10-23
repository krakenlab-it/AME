"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { KeyRound, Mail, RotateCcw, ShieldCheck } from "lucide-react";
import { confirmGeneralAction, resendGeneralAction, startGeneralAction, type GeneralAccessState } from "@/app/ingresar/actions";
import { FingerprintHelp } from "@/components/forms/fingerprint-help";
import { ProtectedNote } from "@/components/portal/hero";
import { Button } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { TermsDialog } from "@/components/ui/terms-dialog";
import {
  identityTermsGate,
  TERMINOS_IDENTIFICACION_AVISO,
  TERMINOS_IDENTIFICACION_CHECKBOX,
} from "@/lib/content/terminos-identificacion";

/** Hasta 10 dígitos (máximo de Supabase) más espacios o guiones al pegar. */
const EMAIL_OTP_INPUT_MAX = 24;

type AuthMethod = "email" | "totp";

interface PanelProps {
  turnstileSiteKey: string | null;
  requireFingerprint: boolean;
  /** "email" (por defecto): código por correo. "totp": aplicación autenticadora (AME_GENERAL_AUTH_METHOD=totp). */
  method?: AuthMethod;
  /** Enlace personal vigente. No se revoca: solo entra al mismo recorrido de correo y cédula. */
  accessToken?: string;
}

/** «Usar otro correo» vuelve a montar el panel para empezar de cero. */
export function GeneralAccessPanel(props: PanelProps) {
  const [round, setRound] = useState(0);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  return (
    <AccessFlow
      key={round}
      {...props}
      restartNotice={notice}
      onRestart={(message) => {
        setNotice(message);
        setRound((n) => n + 1);
      }}
    />
  );
}

function AccessFlow({
  turnstileSiteKey,
  requireFingerprint,
  method = "email",
  accessToken,
  onRestart,
  restartNotice,
}: PanelProps & { onRestart: (message?: string) => void; restartNotice?: string }) {
  const [resent, resendAction, resendPending] = useActionState<GeneralAccessState, FormData>(resendGeneralAction, {});
  const [started, startAction, startPending] = useActionState<GeneralAccessState, FormData>(startGeneralAction, {});
  const [confirmed, confirmAction, confirmPending] = useActionState<GeneralAccessState, FormData>(confirmGeneralAction, {});
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);

  const [termsOpen, setTermsOpen] = useState(false);
  const [termsOpened, setTermsOpened] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pastTerms, setPastTerms] = useState(method !== "email");
  const closeTerms = useCallback(() => setTermsOpen(false), []);
  const termsGate = identityTermsGate({ opened: termsOpened, accepted: termsAccepted });

  const phase = confirmed.phase ?? started.phase ?? "identify";

  // Código por correo: si el reto venció, se empieza de nuevo con el aviso.
  useEffect(() => {
    if (method !== "email") return;
    if (resent.phase === "identify") onRestart(resent.error);
    else if (confirmed.phase === "identify") onRestart(confirmed.error);
  }, [method, resent.phase, resent.error, confirmed.phase, confirmed.error, onRestart]);
  const active = phase === "identify" ? started : { ...started, ...confirmed, qrDataUrl: confirmed.qrDataUrl ?? qrDataUrl ?? started.qrDataUrl };
  const needsCaptcha = Boolean(active.requireCaptcha && turnstileSiteKey && phase === "identify");

  useEffect(() => {
    if (started.phase === "enroll" && started.qrDataUrl) {
      setQrDataUrl(started.qrDataUrl);
      setManualKey(started.manualKey ?? null);
      setOtpauthUrl(started.otpauthUrl ?? null);
    }
    if (started.phase === "identify" || confirmed.phase === "identify") {
      setQrDataUrl(null);
      setManualKey(null);
      setOtpauthUrl(null);
    }
  }, [started.phase, started.qrDataUrl, started.manualKey, started.otpauthUrl, confirmed.phase]);

  useEffect(() => {
    if (!needsCaptcha || document.getElementById("cf-turnstile-script")) return;
    const script = document.createElement("script");
    script.id = "cf-turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [needsCaptcha]);

  return (
    <div className="sheet space-y-6 p-6 md:p-8">
      {method === "email" && !pastTerms ? (
        <TermsGate
          open={termsOpen}
          gate={termsGate}
          accepted={termsAccepted}
          onOpen={() => {
            setTermsOpened(true);
            setTermsOpen(true);
          }}
          onClose={closeTerms}
          onAcceptedChange={setTermsAccepted}
          onStart={() => setPastTerms(true)}
        />
      ) : phase === "identify" ? (
        <IdentifyStep
          state={!active.error && restartNotice && !started.phase ? { ...active, error: restartNotice } : active}
          pending={startPending}
          action={startAction}
          needsCaptcha={needsCaptcha}
          siteKey={turnstileSiteKey}
          requireFingerprint={requireFingerprint}
          method={method}
          accessToken={accessToken}
        />
      ) : phase === "email" ? (
        <EmailCodeStep
          started={started}
          confirmed={confirmed}
          resent={resent}
          pending={confirmPending}
          action={confirmAction}
          resendPending={resendPending}
          resendAction={resendAction}
          onRestart={() => onRestart()}
          accessToken={accessToken}
        />
      ) : phase === "cedula" ? (
        <CedulaStep state={confirmed} pending={confirmPending} action={confirmAction} accessToken={accessToken} />
      ) : (
        <TotpStep
          phase={phase}
          state={active}
          pending={confirmPending}
          action={confirmAction}
          qrDataUrl={active.qrDataUrl ?? qrDataUrl ?? undefined}
          manualKey={started.manualKey ?? manualKey ?? undefined}
          otpauthUrl={started.otpauthUrl ?? otpauthUrl ?? undefined}
        />
      )}
      <ProtectedNote />
    </div>
  );
}

function IdentifyStep({
  state,
  pending,
  action,
  needsCaptcha,
  siteKey,
  requireFingerprint,
  method,
  accessToken,
}: {
  state: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  needsCaptcha: boolean;
  siteKey: string | null;
  requireFingerprint: boolean;
  method: AuthMethod;
  accessToken?: string;
}) {
  const emailError = state.fieldErrors?.email;
  const next = "Después configuras la verificación del teléfono.";
  const cedulaError = state.fieldErrors?.cedula;
  const codeError = state.fieldErrors?.codigoDactilar;
  const banner = state.error && state.error !== "Revisa los campos marcados." ? state.error : undefined;

  if (method === "email") {
    return (
      <>
        <div className="space-y-2">
          <h2 className="text-2xl">Entra con tu correo</h2>
          <p className="text-ink-muted">
            Escribe tu correo y te enviamos un código de acceso. Después te pedimos tu número de cédula.
          </p>
        </div>
        {banner && <Notice tone="error" live>{banner}</Notice>}
        <form action={action} className="space-y-5" noValidate>
          <input type="hidden" name="termsAccepted" value="true" />
          {accessToken ? <input type="hidden" name="accessToken" value={accessToken} /> : null}
          <Field id="email" label="Correo electrónico" required hint="Te enviaremos un código de acceso. Lo usaremos también como tu correo de contacto." error={emailError}>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={state.values?.email}
              className="field-input"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
              aria-invalid={Boolean(emailError)}
              aria-describedby={describedBy("email", { hint: "x", error: emailError })}
            />
          </Field>
          {needsCaptcha && siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-language="es" />}
          <Button type="submit" block loading={pending}>
            <ShieldCheck className="h-5 w-5" aria-hidden />
            {pending ? "Enviando…" : "Enviarme el código"}
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">Entra con tu cédula</h2>
        <p className="text-ink-muted">
          {requireFingerprint
            ? `Escribe tu número de cédula y el código dactilar que aparece en ella. ${next}`
            : `Escribe tu número de cédula. El código dactilar es opcional: si lo escribes y todavía no teníamos uno, lo guardamos para las próximas veces. ${next}`}
        </p>
      </div>
      {banner && <Notice tone="error" live>{banner}</Notice>}
      <form action={action} className="space-y-5" noValidate>
        <Field id="cedula" label="Número de cédula" required hint="10 números, como en tu cédula." error={cedulaError}>
          <input
            id="cedula"
            name="cedula"
            defaultValue={state.values?.cedula}
            className="field-input text-xl tracking-[0.12em]"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            required
            aria-invalid={Boolean(cedulaError)}
            aria-describedby={describedBy("cedula", { hint: "x", error: cedulaError })}
          />
        </Field>
        <Field
          id="codigo-dactilar"
          label="Código dactilar"
          required={requireFingerprint}
          hint={requireFingerprint ? "Una letra, 4 números, una letra y 4 números. Ejemplo: V1234V1234." : "Opcional. Una letra, 4 números, una letra y 4 números. Ejemplo: V1234V1234."}
          error={codeError}
        >
          <input
            id="codigo-dactilar"
            name="codigoDactilar"
            className="field-input text-xl uppercase tracking-[0.14em]"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            required={requireFingerprint}
            aria-invalid={Boolean(codeError)}
            aria-describedby={describedBy("codigo-dactilar", { hint: "x", error: codeError })}
          />
        </Field>
        <FingerprintHelp />
        {needsCaptcha && siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-language="es" />}
        <Button type="submit" block loading={pending}>
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {pending ? "Verificando…" : "Continuar"}
        </Button>
      </form>
    </>
  );
}

function TotpStep({
  phase,
  state,
  pending,
  action,
  qrDataUrl,
  manualKey,
  otpauthUrl,
}: {
  phase: "enroll" | "totp";
  state: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  qrDataUrl?: string;
  manualKey?: string;
  otpauthUrl?: string;
}) {
  const codeError = state.fieldErrors?.code;
  const banner = state.error && state.error !== "Revisa los campos marcados." ? state.error : undefined;

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">{phase === "enroll" ? "Configura tu verificación" : "Código de verificación"}</h2>
        <p className="text-ink-muted">
          {phase === "enroll"
            ? "Google Authenticator u otra aplicación compatible. El icono de aquí es solo una ayuda visual, no el de la tienda."
            : "Abre la aplicación con la que configuraste tu ingreso y escribe los 6 números."}
        </p>
      </div>
      {banner && <Notice tone="error" live>{banner}</Notice>}
      {phase === "enroll" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-marian" aria-hidden />
            <ol className="list-decimal space-y-1 pl-5 text-[15px]">
              <li>Instala la aplicación.</li>
              <li>Escanea el código.</li>
              <li>Escribe el código de 6 dígitos.</li>
            </ol>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {qrDataUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Código para agregar la cuenta en tu aplicación de verificación" width={220} height={220} className="rounded-xl border border-marian-line bg-white p-2" />
              </div>
            )}
            <div className="flex flex-col items-start gap-3">
              <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/google-play-es.png" alt="Disponible en Google Play" width={162} height={63} className="h-10 w-auto" />
              </a>
              <a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/badges/app-store-es.svg" alt="Descargar en el App Store" width={135} height={40} className="h-10 w-auto" />
              </a>
            </div>
          </div>
          {manualKey && otpauthUrl && (
            <div className="space-y-2 rounded-xl bg-marian-soft/50 p-4 md:hidden">
              <p className="text-sm font-semibold">Si no puedes escanear</p>
              <p className="break-all font-mono text-sm tracking-wide">{manualKey}</p>
              <a href={otpauthUrl} className="inline-flex min-h-11 items-center font-semibold text-marian underline-offset-4 hover:underline">Abrir en Authenticator</a>
            </div>
          )}
        </div>
      )}
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="phase" value={phase} />
        <Field id="totp-code" label="Código de 6 números" required error={codeError}>
          <input
            id="totp-code"
            name="code"
            className="field-input max-w-[12rem] tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            aria-invalid={Boolean(codeError)}
            aria-describedby={describedBy("totp-code", { error: codeError })}
          />
        </Field>
        <Button type="submit" block loading={pending}>
          {pending ? "Verificando…" : "Confirmar y continuar"}
        </Button>
      </form>
    </>
  );
}

/** Cuenta regresiva para «Reenviar código». Se reinicia con cada envío (sentStamp). */
function useCountdown(seconds: number | undefined, stamp: number | undefined): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    setLeft(seconds ?? 0);
    if (!seconds) return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds, stamp]);
  return left;
}

function TermsGate({
  open,
  gate,
  accepted,
  onOpen,
  onClose,
  onAcceptedChange,
  onStart,
}: {
  open: boolean;
  gate: { checkboxDisabled: boolean; startDisabled: boolean };
  accepted: boolean;
  onOpen: () => void;
  onClose: () => void;
  onAcceptedChange: (accepted: boolean) => void;
  onStart: () => void;
}) {
  const [lead, link, tail] = splitTermsNotice(TERMINOS_IDENTIFICACION_AVISO);
  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">Antes de empezar</h2>
        <p className="text-ink-muted">
          {lead}
          <button type="button" onClick={onOpen} className="font-semibold text-marian underline underline-offset-4">
            {link}
          </button>
          {tail}
        </p>
      </div>
      <TermsDialog open={open} onClose={onClose} />
      <label className="flex items-start gap-3 text-[15px]">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-marian disabled:opacity-40"
          checked={accepted}
          disabled={gate.checkboxDisabled}
          onChange={(event) => onAcceptedChange(event.target.checked)}
        />
        <span>{TERMINOS_IDENTIFICACION_CHECKBOX}</span>
      </label>
      {gate.checkboxDisabled ? <p className="text-sm text-ink-muted">Abre el mecanismo de identificación para poder aceptar.</p> : null}
      <Button type="button" block disabled={gate.startDisabled} onClick={onStart}>
        Empezar validación
      </Button>
    </>
  );
}

function splitTermsNotice(notice: string): [string, string, string] {
  const link = "haz click aquí";
  const at = notice.indexOf(link);
  if (at < 0) return [notice, link, ""];
  return [notice.slice(0, at), link, notice.slice(at + link.length)];
}

function CedulaStep({
  state,
  pending,
  action,
  accessToken,
}: {
  state: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  accessToken?: string;
}) {
  const cedulaError = state.fieldErrors?.cedula;
  const codeError = state.fieldErrors?.codigoDactilar;
  const banner = state.error && state.error !== "Revisa los campos marcados." ? state.error : undefined;
  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">Tu cédula</h2>
        <p className="text-ink-muted">Escribe tu número de cédula. Es obligatorio. El código dactilar es opcional.</p>
      </div>
      {banner && <Notice tone="error" live>{banner}</Notice>}
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="phase" value="cedula" />
        {accessToken ? <input type="hidden" name="accessToken" value={accessToken} /> : null}
        <fieldset className="space-y-4 rounded-xl border border-marian-line p-4">
          <legend className="px-1 text-sm font-semibold">Tu cédula</legend>
          <Field id="cedula" label="Número de cédula" required hint="10 números, como en tu cédula." error={cedulaError}>
            <input
              id="cedula"
              name="cedula"
              defaultValue={state.values?.cedula}
              className="field-input text-xl tracking-[0.12em]"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              required
              aria-invalid={Boolean(cedulaError)}
              aria-describedby={describedBy("cedula", { hint: "x", error: cedulaError })}
            />
          </Field>
          <Field id="codigo-dactilar" label="Código dactilar" hint="Opcional. Una letra, 4 números, una letra y 4 números. Ejemplo: V1234V1234." error={codeError}>
            <input
              id="codigo-dactilar"
              name="codigoDactilar"
              className="field-input text-xl uppercase tracking-[0.14em]"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              aria-invalid={Boolean(codeError)}
              aria-describedby={describedBy("codigo-dactilar", { hint: "x", error: codeError })}
            />
          </Field>
          <FingerprintHelp />
        </fieldset>
        <Button type="submit" block loading={pending}>
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {pending ? "Verificando…" : "Continuar"}
        </Button>
      </form>
    </>
  );
}

function EmailCodeStep({
  started,
  confirmed,
  resent,
  pending,
  action,
  resendPending,
  resendAction,
  onRestart,
  accessToken,
}: {
  started: GeneralAccessState;
  confirmed: GeneralAccessState;
  resent: GeneralAccessState;
  pending: boolean;
  action: (payload: FormData) => void;
  resendPending: boolean;
  resendAction: (payload: FormData) => void;
  onRestart: () => void;
  accessToken?: string;
}) {
  // El aviso más reciente gana: reenvío o confirmación.
  const latestResend = (resent.sentStamp ?? 0) >= (started.sentStamp ?? 0) && (resent.error || resent.info) ? resent : null;
  const maskedEmail = resent.maskedEmail ?? started.maskedEmail;
  const cooldown = latestResend?.resendAfterSeconds !== undefined ? latestResend : started;
  const left = useCountdown(cooldown.resendAfterSeconds, cooldown.sentStamp);
  const codeError = confirmed.fieldErrors?.code;
  const confirmBanner = confirmed.error && confirmed.error !== "Revisa los campos marcados." ? confirmed.error : undefined;

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-2xl">Revisa tu correo</h2>
        <p className="text-ink-muted">
          Te enviamos un código de acceso{maskedEmail ? <> a <strong className="text-ink">{maskedEmail}</strong></> : null}. Escríbelo aquí para continuar. Vence en 10 minutos.
        </p>
        <p className="text-sm text-ink-muted">Si no lo ves, revisa la carpeta de correo no deseado o spam.</p>
      </div>
      {confirmBanner && <Notice tone="error" live>{confirmBanner}</Notice>}
      {latestResend?.error && <Notice tone="error" live>{latestResend.error}</Notice>}
      {latestResend?.info && !latestResend.error && <Notice tone="info" live>{latestResend.info}</Notice>}
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="phase" value="email" />
        {accessToken ? <input type="hidden" name="accessToken" value={accessToken} /> : null}
        <Field id="email-code" label="Código de acceso" required error={codeError}>
          <input
            id="email-code"
            name="code"
            className="field-input max-w-[16rem] tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            spellCheck={false}
            pattern="[0-9 \-]*"
            maxLength={EMAIL_OTP_INPUT_MAX}
            required
            aria-invalid={Boolean(codeError)}
            aria-describedby={describedBy("email-code", { error: codeError })}
          />
        </Field>
        <Button type="submit" block loading={pending}>
          <Mail className="h-5 w-5" aria-hidden />
          {pending ? "Verificando…" : "Confirmar y continuar"}
        </Button>
      </form>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form action={resendAction}>
          <button
            type="submit"
            disabled={left > 0 || resendPending}
            className="inline-flex min-h-11 items-center gap-2 font-semibold text-marian underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {resendPending ? "Enviando…" : left > 0 ? `Reenviar código en ${left} s` : "Reenviar código"}
          </button>
        </form>
        <button type="button" onClick={onRestart} className="inline-flex min-h-11 items-center font-semibold text-marian underline-offset-4 hover:underline">
          Usar otro correo
        </button>
      </div>
    </>
  );
}
