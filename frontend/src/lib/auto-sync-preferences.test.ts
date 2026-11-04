import { afterEach, expect, it, vi } from "vitest";
import { subscribeAutoSyncPreferences } from "./auto-sync-runtime";
import { publishTutorPreferencesChanged } from "./tutor-preference-events";
afterEach(() => vi.unstubAllGlobals());
it("routes only the active UID's local and cross-tab preference changes without echo", () => {
  const target = new EventTarget(), setItem = vi.fn();
  vi.stubGlobal("window", Object.assign(target, { localStorage: { setItem } }));
  const runtime = { setIntegrationEnabled: vi.fn() }, unsubscribe = subscribeAutoSyncPreferences("A", runtime);
  publishTutorPreferencesChanged({ uid: "B", kodland_enabled: false }); expect(runtime.setIntegrationEnabled).not.toHaveBeenCalled();
  publishTutorPreferencesChanged({ uid: "A", kodland_enabled: false }); expect(runtime.setIntegrationEnabled).toHaveBeenLastCalledWith(false);
  publishTutorPreferencesChanged({ uid: "A", kodland_enabled: true }); expect(runtime.setIntegrationEnabled).toHaveBeenLastCalledWith(true);
  const priorWrites = setItem.mock.calls.length;
  const event = new Event("storage"); Object.assign(event, { key: "nexusclass:tutor-preferences-event", newValue: JSON.stringify({ change: { uid: "A", kodland_enabled: false } }) }); target.dispatchEvent(event);
  expect(runtime.setIntegrationEnabled).toHaveBeenCalledTimes(3); expect(runtime.setIntegrationEnabled).toHaveBeenLastCalledWith(false); expect(setItem).toHaveBeenCalledTimes(priorWrites);
  unsubscribe(); publishTutorPreferencesChanged({ uid: "A", kodland_enabled: true }); expect(runtime.setIntegrationEnabled).toHaveBeenCalledTimes(3);
});
