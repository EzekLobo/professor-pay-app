import { afterEach, expect, it, vi } from "vitest";
import { publishTutorPreferencesChanged, subscribeTutorPreferencesChanged } from "./tutor-preference-events";
afterEach(() => vi.unstubAllGlobals());
it("invalidates only the matching account locally and forwards no credentials", () => {
  const target = new EventTarget(); const setItem = vi.fn();
  vi.stubGlobal("window", Object.assign(target, { localStorage: { setItem } }));
  const listener = vi.fn(), unsubscribe = subscribeTutorPreferencesChanged("A", listener);
  publishTutorPreferencesChanged({ uid: "B", kodland_enabled: false });
  expect(listener).not.toHaveBeenCalled();
  publishTutorPreferencesChanged({ uid: "A", kodland_enabled: false });
  expect(listener).toHaveBeenCalledWith({ uid: "A", kodland_enabled: false });
  expect(JSON.parse(setItem.mock.calls[1][1]).change).toEqual({ uid: "A", kodland_enabled: false });
  unsubscribe(); publishTutorPreferencesChanged({ uid: "A", kodland_enabled: true });
  expect(listener).toHaveBeenCalledTimes(1);
});
it("accepts cross-tab invalidation without echo and rejects malformed payloads", () => {
  const target = new EventTarget(); const setItem = vi.fn();
  vi.stubGlobal("window", Object.assign(target, { localStorage: { setItem } }));
  const listener = vi.fn(), unsubscribe = subscribeTutorPreferencesChanged("A", listener);
  const message = (value: string) => { const event = new Event("storage"); Object.assign(event, { key: "nexusclass:tutor-preferences-event", newValue: value }); target.dispatchEvent(event); };
  message("{bad"); message(JSON.stringify({ change: { uid: "B", kodland_enabled: false } }));
  message(JSON.stringify({ change: { uid: "A", kodland_enabled: false } }));
  expect(listener).toHaveBeenCalledTimes(1); expect(setItem).not.toHaveBeenCalled(); unsubscribe();
});
