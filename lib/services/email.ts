/**
 * Correo de confirmación (Resend, vía API REST). No incluye datos bancarios ni personales sensibles.
 * Si RESEND_API_KEY no está configurada, el envío se omite sin interrumpir el flujo.
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

function escapeHtml(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendConfirmationEmail(to: string, code: string, contact: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const { subject, text, html } = confirmationEmail(code, contact);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (!res.ok) console.error(`[email] envío fallido (${res.status})`);
    return res.ok;
  } catch {
    console.error("[email] error de red al enviar la confirmación");
    return false;
  }
}
