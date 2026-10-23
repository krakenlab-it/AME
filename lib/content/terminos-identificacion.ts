/**
 * Texto del mecanismo de identificación que la persona debe abrir antes de empezar.
 * El párrafo que llegó de Jaime está cortado. No completar ni parafrasear el resto:
 * se pega aquí cuando llegue el texto definitivo.
 */
export const TERMINOS_IDENTIFICACION_TITULO = "Mecanismo de identificación y verificación de identidad";

export const TERMINOS_IDENTIFICACION_TEXTO =
  "El correo electrónico registrado por el usuario constituye el factor principal de identificación dentro de la plataforma.\n\nDe manera adicional, el registro del número de cédula de ciudadanía junto con el código dactilar que consta en el reverso del documento físico constituye un segundo factor de verificación de identidad. Dado que el código dactilar figura únicamente en la cédula física, su ingreso, en conjunto con el número de cédula, certifica que el usuario tiene en su poder el documento de identid[ad]…";

// TODO: texto completo pendiente de Jaime

export const TERMINOS_IDENTIFICACION_AVISO =
  "Antes de empezar debes aceptar estos términos, haz click aquí para leerlos";

export const TERMINOS_IDENTIFICACION_CHECKBOX =
  "He leído el mecanismo de identificación de identidad y acepto el tratamiento de mis datos personales.";

/** La casilla no se puede marcar hasta abrir el texto. El botón espera esa aceptación. */
export function identityTermsGate(state: { opened: boolean; accepted: boolean }): { checkboxDisabled: boolean; startDisabled: boolean } {
  return {
    checkboxDisabled: !state.opened,
    startDisabled: !state.opened || !state.accepted,
  };
}
