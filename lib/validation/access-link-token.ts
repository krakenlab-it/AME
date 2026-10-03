import { isPreviewDemoAccessToken, normalizePreviewDemoToken } from "@/lib/demo/preview-outreach-tokens";

export const STANDARD_ACCESS_LINK_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

export function normalizeAccessLinkToken(raw: string): string {
  return normalizePreviewDemoToken(raw);
}

export function isAccessLinkToken(raw: string): boolean {
  const token = normalizeAccessLinkToken(raw);
  return STANDARD_ACCESS_LINK_TOKEN.test(token) || isPreviewDemoAccessToken(token);
}
