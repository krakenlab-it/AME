import { REQUIRED_PRIVACY_FIELDS, type PrivacyConfig } from "@/config/privacy";
import { findPlaceholders, hasPlaceholder } from "./placeholders";

export type DeployStage = "production" | "preview" | "development";

/**
 * Etapa de despliegue. En Vercel, VERCEL_ENV manda sobre APP_STAGE compartida:
 * muchos proyectos tienen APP_STAGE=production en todas las variables y eso no
 * debe tratar los despliegues Preview como producción.
 */
export function deployStage(): DeployStage {
  switch (process.env.VERCEL_ENV) {
    case "preview":
      return "preview";
    case "development":
      return "development";
    case "production":
      return "production";
    default:
      break;
  }
  switch (process.env.APP_STAGE) {
    case "preview":
      return "preview";
    case "production":
      return "production";
    case "development":
      return "development";
    default:
      return "development";
  }
}

export interface LegalReadiness {
  ready: boolean;
  approved: boolean;
  placeholders: string[];
  stage: DeployStage;
  /** true = el portal debe bloquear formularios (producción sin revisión legal completa). */
  blockPortal: boolean;
}

export function checkLegalReadiness(config: PrivacyConfig, noticeText: string): LegalReadiness {
  const placeholders = new Set<string>();
  for (const field of REQUIRED_PRIVACY_FIELDS) {
    const value = String(config[field]);
    if (hasPlaceholder(value)) findPlaceholders(value).forEach((p) => placeholders.add(p));
  }
  if (hasPlaceholder(config.retention.reason)) findPlaceholders(config.retention.reason).forEach((p) => placeholders.add(p));
  findPlaceholders(noticeText).forEach((p) => placeholders.add(p));

  const approved = process.env.LEGAL_REVIEW_APPROVED === "true";
  const ready = placeholders.size === 0 && approved;
  const stage = deployStage();
  return { ready, approved, placeholders: [...placeholders], stage, blockPortal: stage === "production" && !ready };
}
