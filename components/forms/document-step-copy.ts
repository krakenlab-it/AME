export interface DocumentStepCopy {
  heading: string;
  intro: string;
  legend: string;
  label: string;
  hint: string;
  inputMode: "text" | "numeric";
  autoCapitalize: "characters" | undefined;
  inputClassName: string;
  emailStepBlurb: string;
}

/**
 * Textos del paso de documento de /ingresar. Con el ingreso por pasaporte apagado (AME_PASSPORT_SIGNIN=off)
 * vuelven a ser los de solo cédula. El enlace personal de pasaporte conserva su texto propio.
 */
export function documentStepCopy(passportSignIn: boolean, hideFingerprint: boolean): DocumentStepCopy {
  if (passportSignIn) {
    return {
      heading: "Tu cédula o pasaporte",
      intro: hideFingerprint
        ? "Escribe el número de tu pasaporte, tal como está en el documento."
        : "Escribe tu número de cédula o de pasaporte y el código dactilar del reverso de tu cédula.",
      legend: "Tu cédula o pasaporte",
      label: "Número de cédula o pasaporte",
      hint: "Cédula: 10 números. Pasaporte: letras y números, como en el documento.",
      inputMode: "text",
      autoCapitalize: "characters",
      inputClassName: "field-input text-xl uppercase tracking-[0.12em]",
      emailStepBlurb: "Escribe tu correo y te enviamos un código de acceso. Después te pedimos tu número de cédula o pasaporte.",
    };
  }
  return {
    heading: "Tu cédula",
    intro: hideFingerprint
      ? "Escribe el número de tu pasaporte, tal como está en el documento."
      : "Escribe tu número de cédula y el código dactilar del reverso.",
    legend: "Tu cédula",
    label: "Número de cédula",
    hint: "10 números, como en tu cédula.",
    inputMode: "numeric",
    autoCapitalize: undefined,
    inputClassName: "field-input text-xl tracking-[0.12em]",
    emailStepBlurb: "Escribe tu correo y te enviamos un código de acceso. Después te pedimos tu número de cédula.",
  };
}
