import "server-only";
import { getPrivacyConfig } from "@/config/privacy";
import type { RespondentRepo } from "@/lib/database/types";
import { DEFAULT_NOTICE_TEMPLATE, renderConsentTexts, renderTemplate } from "./notice";
import { checkLegalReadiness } from "./readiness";

/** Aviso vigente (versión publicada desde /admin/aviso o el texto por defecto) + estado legal. */
export async function getActivePrivacy(repo: Pick<RespondentRepo, "getActiveNotice">) {
  const config = getPrivacyConfig();
  const notice = await repo.getActiveNotice();
  const template = notice?.body ?? DEFAULT_NOTICE_TEMPLATE;
  const version = notice?.version ?? config.privacyNoticeVersion;
  const text = renderTemplate(template, config);
  const consentTexts = renderConsentTexts(config);
  const readiness = checkLegalReadiness(config, `${text}\n${Object.values(consentTexts).join("\n")}`);
  return {
    config,
    version,
    text,
    consentTexts,
    readiness,
    effectiveDate: notice?.effective_date ?? config.privacyNoticeEffectiveDate,
    fromDatabase: Boolean(notice),
  };
}

export type ActivePrivacy = Awaited<ReturnType<typeof getActivePrivacy>>;
