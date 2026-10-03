import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import {
  ensurePreviewOutreachAnchor,
  PREVIEW_OUTREACH_RAW_TOKEN,
} from "@/lib/seed/preview-outreach-anchor";
import { inspectLink } from "@/lib/services/respondent";

vi.mock("server-only", () => ({}));

describe("ancla de enlace Preview", () => {
  it("el token fijo es válido en memoria vacía", async () => {
    process.env.PORTAL_PREVIEW_SANDBOX_BUILD = "true";
    const repo = new MemoryRepo();
    ensurePreviewOutreachAnchor(repo);
    expect(await inspectLink(repo, PREVIEW_OUTREACH_RAW_TOKEN, "test-ip")).toBe("valid");
  });
});
