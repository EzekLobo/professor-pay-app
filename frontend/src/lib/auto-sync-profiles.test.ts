import { describe, expect, it, vi, afterEach } from "vitest";
import type { KodlandStudent } from "./api";
import { incompleteProfileIds, refreshIncompleteProfiles } from "./auto-sync-profiles";
const now = Date.parse("2026-11-08T12:00:00Z");
const student = (fields = {}) => ({ external_id: "one", name: "Aluno", phone: "11987654321", status: "active", lesson_credits_remaining: 2, lesson_credits_updated_at: new Date(now).toISOString(), ...fields }) as KodlandStudent;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("profile repair budget", () => {
  it("skips complete, hidden and inactive profiles, deduplicates incomplete IDs", () => {
    expect(incompleteProfileIds([student(), student({ external_id: "hidden", hidden: true, phone: "" }), student({ external_id: "old", status: "inactive", phone: "" }), student({ phone: "" }), student({ phone: "" })], {}, now)).toEqual(["one"]);
  });
  it("renews credits daily and respects successful and failed attempts", () => {
    const rows = [student({ lesson_credits_updated_at: "2026-11-06T00:00:00Z" })];
    expect(incompleteProfileIds(rows, {}, now)).toEqual(["one"]);
    expect(incompleteProfileIds(rows, { one: { at: now - 60000 } }, now)).toEqual([]);
    expect(incompleteProfileIds(rows, { one: { at: now - 31 * 60000, failed: true } }, now)).toEqual(["one"]);
  });
  it("batches twenty, survives malformed cache and prevents immediate retries", async () => {
    const cache = new Map<string, string>([["nexusclass.profile-attempts.user", "null"]]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => cache.get(key), setItem: (key: string, value: string) => cache.set(key, value) });
    const rows = Array.from({ length: 43 }, (_, index) => student({ external_id: String(index), phone: "" }));
    const sync = vi.fn(async () => undefined);
    await refreshIncompleteProfiles("user", rows, sync, () => true);
    expect(sync.mock.calls.map(args => (args as unknown as [string[]])[0].length)).toEqual([20, 20, 3]);
    await refreshIncompleteProfiles("user", rows, sync, () => true);
    expect(sync).toHaveBeenCalledTimes(3);
    await refreshIncompleteProfiles("other", rows, sync, () => false);
    expect(sync).toHaveBeenCalledTimes(3);
  });
});
