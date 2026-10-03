import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { applyPreviewSandboxSnapshot, serializePreviewSandboxSnapshot } from "@/lib/demo/preview-sandbox-store";
import { issueLinks } from "@/lib/services/links";

describe("preview sandbox snapshot", () => {
  it("conserva personas y tokens entre restauraciones", async () => {
    const repo = new MemoryRepo();
    const id = repo.addPerson("Ana", "Paz", "1710034065");
    repo.outreachEmails.set(id, "ana@example.com");
    await issueLinks(repo, [id], "admin");
    const snap = serializePreviewSandboxSnapshot(repo);
    const fresh = new MemoryRepo();
    applyPreviewSandboxSnapshot(fresh, snap);
    expect(fresh.people.size).toBe(1);
    expect(fresh.tokens.size).toBe(1);
    expect(fresh.outreachEmails.get(id)).toBe("ana@example.com");
  });
});
