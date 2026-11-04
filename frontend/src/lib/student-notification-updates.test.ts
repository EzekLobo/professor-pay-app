import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishSyncDataChanged, type SyncDataEvent } from "./sync-events";
import { subscribeNotificationDataChanges } from "./student-notification-updates";
import { clearStudentNotificationSourceCache } from "./student-notification-source";
vi.mock("./student-notification-source", () => ({ clearStudentNotificationSourceCache: vi.fn() }));
beforeEach(() => { vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: { setItem: vi.fn() } })); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });
const event = (changes: Partial<SyncDataEvent> = {}): SyncDataEvent => ({ uid: "owner", scope: "activities", domains: ["activities"], resourceId: "g1", revision: "revision", completedAt: 1000, ...changes });
describe("notification refresh events", () => {
  it("invalidates cached source only after operational data events of its own account", () => {
    const refresh = vi.fn(); const stop = subscribeNotificationDataChanges("owner", refresh);
    publishSyncDataChanged(event({ uid: "another" }));
    publishSyncDataChanged(event({ scope: "payroll", domains: ["payments"] }));
    expect(refresh).not.toHaveBeenCalled();
    publishSyncDataChanged(event());
    publishSyncDataChanged(event({ scope: "attendance", domains: ["attendance"] }));
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(clearStudentNotificationSourceCache).toHaveBeenCalledTimes(2);
    stop(); publishSyncDataChanged(event()); expect(refresh).toHaveBeenCalledTimes(2);
  });
});
