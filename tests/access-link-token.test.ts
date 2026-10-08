import { describe, expect, it } from "vitest";
import { PREVIEW_OUTREACH_RAW_TOKEN } from "@/lib/demo/preview-outreach-tokens";
import { isAccessLinkToken } from "@/lib/validation/access-link-token";
import { identifySchema } from "@/lib/validation/schemas";

describe("token de enlace de acceso", () => {
  it("acepta el slug de demostración en Preview", () => {
    expect(isAccessLinkToken(PREVIEW_OUTREACH_RAW_TOKEN)).toBe(true);
    expect(identifySchema.safeParse({ token: PREVIEW_OUTREACH_RAW_TOKEN, cedula: "1710034065" }).success).toBe(true);
  });
});
