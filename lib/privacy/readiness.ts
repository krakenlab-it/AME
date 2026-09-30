import { REQUIRED_PRIVACY_FIELDS, type PrivacyConfig } from "@/config/privacy";
import { findPlaceholders, hasPlaceholder } from "./placeholders";

export type DeployStage = "production" | "preview" | "development";

export function deployStage(): DeployStage {
  if (process.env.APP_STAGE === "production" || process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview" || process.env.APP_STAGE === "preview") return "preview";
  return "development";
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
