import { redirect } from "next/navigation";
import { endRespondentSession } from "@/lib/server/end-respondent-session";

/**
 * Enlace estable para correos y pruebas: siempre reinicia el recorrido del asegurado
 * (portada + cédula), sin retomar /mi-cuenta ni un formulario a medias.
 */
export async function GET() {
  await endRespondentSession();
  redirect("/");
}
