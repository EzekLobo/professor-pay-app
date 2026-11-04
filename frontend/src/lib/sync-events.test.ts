import { afterEach, describe, expect, it, vi } from "vitest";
import { publishSyncDataChanged, subscribeSyncDataChanged, type SyncDataEvent } from "./sync-events";

afterEach(() => vi.unstubAllGlobals());
const source: SyncDataEvent = { uid: "owner", scope: "payroll", domains: ["payments"], resourceId: "period-1", revision: "revision-1", completedAt: 123 };
const install = () => {
  const localStorage = { setItem: vi.fn() };
  const browser = Object.assign(new EventTarget(), { localStorage });
  vi.stubGlobal("window", browser);
  return { browser, localStorage };
};
function storage(value: unknown) {
  const event = new Event("storage");
  Object.assign(event, { key: "nexusclass:sync-data-event", newValue: JSON.stringify(value) });
  return event;
}

describe("synchronization data events", () => {
  it("publishes locally and bridges only identifiers to another tab", () => {
    const { localStorage } = install(), receive = vi.fn();
    const stop = subscribeSyncDataChanged("owner", receive);
    publishSyncDataChanged({ ...source, secret: "must-not-leak" } as SyncDataEvent);
    expect(receive).toHaveBeenCalledWith(source);
    const packet = JSON.parse(localStorage.setItem.mock.calls[0][1]);
    expect(packet.event).toEqual(source); expect(JSON.stringify(packet)).not.toContain("must-not-leak");
    stop();
  });
  it("isolates accounts, deduplicates packets, and never echoes incoming storage changes", () => {
    const { browser, localStorage } = install(), receive = vi.fn();
    const stop = subscribeSyncDataChanged("owner", receive);
    browser.dispatchEvent(storage({ id: "other", event: { ...source, uid: "other" } }));
    browser.dispatchEvent(storage({ id: "one", event: source }));
    browser.dispatchEvent(storage({ id: "one", event: source }));
    browser.dispatchEvent(storage({ id: "broken", event: { ...source, domains: ["unrecognized"] } }));
    expect(receive).toHaveBeenCalledTimes(1); expect(localStorage.setItem).not.toHaveBeenCalled();
    stop(); browser.dispatchEvent(storage({ id: "two", event: source }));
    expect(receive).toHaveBeenCalledTimes(1);
  });
  it("keeps local notifications when browser storage is blocked", () => {
    const { localStorage } = install(), receive = vi.fn();
    localStorage.setItem.mockImplementation(() => { throw new Error("blocked"); });
    const stop = subscribeSyncDataChanged("owner", receive);
    expect(() => publishSyncDataChanged(source)).not.toThrow(); expect(receive).toHaveBeenCalledTimes(1); stop();
  });
});
