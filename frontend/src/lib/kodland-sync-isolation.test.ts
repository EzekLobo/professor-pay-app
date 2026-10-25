import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: "colleague" } }),
  getFirebaseDb: () => ({}),
}));
vi.mock("firebase/firestore", async (original) => ({
  ...await original<typeof import("firebase/firestore")>(),
  collection: (_db: unknown, path: string) => path,
  query: (path: unknown) => path,
  orderBy: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [{
    id: "old-lesson",
    data: () => ({ external_class_id: "another-teacher-group", source_lesson_id: "old-source", materials_status: "pending" }),
  }] })),
}));
import { kodlandApi } from "./api";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("full sync account isolation", () => {
  it("never requests old materials belonging to groups outside the current account", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const sync = vi.spyOn(kodlandApi, "sync").mockResolvedValue({
      group_count: 1, student_count: 1, review_count: 0, lesson_count: 0,
      extra_lesson_count: 0, group_ids: ["current-group"],
    });
    const result = await kodlandApi.syncAll("colleague", "password");
    expect(sync).toHaveBeenCalledWith("colleague", "password", "corrections", { correctionGroupIds: ["current-group"] });
    expect(fetch).not.toHaveBeenCalled();
    expect(result.material_count).toBe(0);
  });
});
