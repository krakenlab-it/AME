/**
 * Correo de confirmación (Resend, vía API REST). No incluye datos bancarios ni personales sensibles.
 * Si RESEND_API_KEY no está configurada, el envío se omite. El panel lo muestra; no es un requisito para el resto.
 */
export function confirmationEmail(code: string, contact: string) {
  const subject = "Confirmación de actualización de información";
  const text = `Hemos registrado correctamente la actualización de su información.

Por seguridad, este correo no contiene sus datos bancarios ni información personal sensible.

Número de confirmación:
${code}

Si usted no realizó esta actualización, comuníquese con nosotros a ${contact}.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#13263A;max-width:520px;line-height:1.55">
<p>Hemos registrado correctamente la actualización de su información.</p>
<p>Por seguridad, este correo no contiene sus datos bancarios ni información personal sensible.</p>
<p>Número de confirmación:<br><strong style="font-size:20px;letter-spacing:1px">${escapeHtml(code)}</strong></p>
<p>Si usted no realizó esta actualización, comuníquese con nosotros a ${escapeHtml(contact)}.</p></div>`;
  return { subject, text, html };
}

export function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Enlace personal para completar datos. No incluye cédula, banco ni otros datos sensibles. */
export function personalLinkEmail(input: { firstName: string; url: string; expiresAt: string; organization: string }): OutboundEmail {
  const when = new Date(input.expiresAt).toLocaleString("es-EC", { dateStyle: "long", timeStyle: "short", timeZone: "America/Guayaquil" });
  const subject = "Completa tus datos del seguro";
  const text = `Hola ${input.firstName}:

${input.organization} te invita a completar tus datos de contacto para la gestión del seguro.

Abre tu enlace personal (vence el ${when}):
${input.url}

El enlace es solo para ti. No lo reenvíes. Este correo no incluye tu cédula ni datos bancarios.`;
  const html = `<div style="font-family:Arial,sans-serif;color:#13263A;max-width:520px;line-height:1.55">
<p>Hola ${escapeHtml(input.firstName)}:</p>
<p>${escapeHtml(input.organization)} te invita a completar tus datos de contacto para la gestión del seguro.</p>
<p>Abre tu enlace personal (vence el ${escapeHtml(when)}):<br>
<a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>
<p>El enlace es solo para ti. No lo reenvíes. Este correo no incluye tu cédula ni datos bancarios.</p></div>`;
  return { to: "", subject, text, html };
}

export async function deliverEmail(message: OutboundEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!res.ok) console.error(`[email] envío fallido (${res.status})`);
    return res.ok;
  } catch {
    console.error("[email] error de red al enviar");
    return false;
  }
}

export async function sendConfirmationEmail(to: string, code: string, contact: string): Promise<boolean> {
  const { subject, text, html } = confirmationEmail(code, contact);
  return deliverEmail({ to, subject, text, html });
}
