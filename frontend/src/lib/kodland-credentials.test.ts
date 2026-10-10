import { beforeEach, describe, expect, it, vi } from "vitest";

const documents = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase-admin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: (id: string) => ({
        set: async (value: Record<string, unknown>) => {
          documents.set(id, value);
        },
        get: async () => ({
          exists: documents.has(id),
          get: (field: string) => documents.get(id)?.[field],
        }),
      }),
    }),
  }),
}));

import {
  loadKodlandCredentials,
  saveKodlandCredentials,
} from "./kodland-credentials";

describe("Kodland credential vault", () => {
  beforeEach(() => {
    documents.clear();
    process.env.KODLAND_CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
  });

  it("stores an encrypted value and restores it only on the server", async () => {
    await saveKodlandCredentials("teacher-1", {
      username: "teacher@example.com",
      password: "very-private-password",
    });

    const stored = documents.get("teacher-1");
    expect(stored?.ciphertext).toEqual(expect.any(String));
    expect(stored?.ciphertext).not.toContain("teacher@example.com");
    expect(stored?.ciphertext).not.toContain("very-private-password");
    await expect(loadKodlandCredentials("teacher-1")).resolves.toEqual({
      username: "teacher@example.com",
      password: "very-private-password",
    });
  });
});
