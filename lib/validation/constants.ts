export const BANKS = [
  "Banco Pichincha",
  "Banco Guayaquil",
  "Banco del Pacífico",
  "Produbanco",
  "Banco Internacional",
  "Banco Bolivariano",
  "Banco del Austro",
  "Banco General Rumiñahui",
  "Banco Solidario",
  "Banco Machala",
  "Cooperativa",
  "Otro",
] as const;
export type BankOption = (typeof BANKS)[number];

/** Opciones que requieren escribir el nombre de la institución. */
export const BANKS_REQUIRING_NAME: readonly BankOption[] = ["Cooperativa", "Otro"];

export const ACCOUNT_TYPES = ["Ahorros", "Corriente"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const EC_PROVINCES = [
  "Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi", "El Oro", "Esmeraldas",
  "Galápagos", "Guayas", "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago", "Napo",
  "Orellana", "Pastaza", "Pichincha", "Santa Elena", "Santo Domingo de los Tsáchilas",
  "Sucumbíos", "Tungurahua", "Zamora Chinchipe",
] as const;

export const PHONE_COUNTRY_CODES = [
  { code: "+593", label: "🇪🇨 Ecuador +593" },
  { code: "+1", label: "🇺🇸 Estados Unidos / Canadá +1" },
  { code: "+34", label: "🇪🇸 España +34" },
  { code: "+57", label: "🇨🇴 Colombia +57" },
  { code: "+51", label: "🇵🇪 Perú +51" },
  { code: "+52", label: "🇲🇽 México +52" },
  { code: "+56", label: "🇨🇱 Chile +56" },
  { code: "+54", label: "🇦🇷 Argentina +54" },
  { code: "+39", label: "🇮🇹 Italia +39" },
  { code: "+49", label: "🇩🇪 Alemania +49" },
  { code: "+44", label: "🇬🇧 Reino Unido +44" },
  { code: "+507", label: "🇵🇦 Panamá +507" },
  { code: "+58", label: "🇻🇪 Venezuela +58" },
] as const;

export const PERSON_STATUSES = ["PENDING", "STARTED", "COMPLETED", "NEEDS_REVIEW"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const STATUS_LABELS: Record<PersonStatus, string> = {
  PENDING: "Pendiente",
  STARTED: "Iniciado",
  COMPLETED: "Completado",
  NEEDS_REVIEW: "Requiere revisión",
};

export const GENERIC_IDENTIFY_ERROR =
  "No pudimos verificar la información proporcionada. Revisa los datos o utiliza el enlace que recibiste.";
