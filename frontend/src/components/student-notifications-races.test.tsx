import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DemoSnapshot } from "@/lib/demo-snapshot";
const harness = vi.hoisted(() => ({ cursor: 0, slots: [] as Array<Record<string, unknown>>, effects: [] as Array<{ slot: Record<string, unknown>; work: () => void | (() => void) }>, settings: vi.fn(), cases: vi.fn(), reconcile: vi.fn(), source: vi.fn() }));
vi.mock("react", async original => {
 const react=await original<typeof import("react")>();
 const changed=(a:unknown[]|undefined,b:unknown[]|undefined)=>!a||!b||a.length!==b.length||a.some((value,i)=>!Object.is(value,b[i]));
 const memo=(work:()=>unknown,deps:unknown[])=>{const slot=harness.slots[harness.cursor++]??={};if(changed(slot.deps as unknown[],deps)){slot.deps=deps;slot.value=work();}return slot.value;};
 return {...react,useRef:(initial:unknown)=>{const slot=harness.slots[harness.cursor++]??={current:initial};return slot;},
  useState:(initial:unknown)=>{const slot=harness.slots[harness.cursor++]??={value:typeof initial==="function"?initial():initial};return [slot.value,(value:unknown)=>{slot.value=typeof value==="function"?value(slot.value):value;}];},
  useMemo:memo,useCallback:(work:unknown,deps:unknown[])=>memo(()=>work,deps),
  useEffect:(work:()=>void|(()=>void),deps:unknown[])=>{const slot=harness.slots[harness.cursor++]??={};if(changed(slot.deps as unknown[],deps)){slot.deps=deps;harness.effects.push({slot,work});}}
 };
});
vi.mock("./use-kodland-auto-sync",()=>({useKodlandAutoSync:()=>({phase:"idle"})}));
vi.mock("@/lib/student-notification-source",()=>({loadStudentNotificationSource:harness.source,demoStudentNotificationSource:harness.source,loadBrowserKodlandNotificationSource:harness.source,clearStudentNotificationSourceCache:vi.fn()}));
vi.mock("@/lib/student-notification-store",()=>{
 const store={settings:harness.settings,cases:harness.cases,reconcile:harness.reconcile};return {createDemoStudentNotificationStore:()=>store,createStudentNotificationStore:()=>store,subscribeStudentNotifications:()=>()=>undefined};
});
vi.mock("@/lib/tutor-preference-events",()=>({subscribeTutorPreferencesChanged:()=>()=>undefined}));
vi.mock("@/lib/api",()=>({kodlandApi:{},manualTeachingApi:{},tutorPreferencesApi:{get:async()=>({})}}));
vi.mock("@/lib/operation-log-client",()=>({reportOperation:vi.fn(),observeOperation:vi.fn()}));
import { StudentNotificationsProvider } from "./student-notifications";
import { defaultNotificationSettings } from "@/lib/student-notification-rules";
const first={tutorPreferences:{absence_message_template:"old"}} as DemoSnapshot;
function render(snapshot=first){harness.cursor=0;const result=StudentNotificationsProvider({uid:"demo-profile",snapshot,children:null});const effects=harness.effects.splice(0);for(const {slot} of effects)(slot.cleanup as (()=>void)|undefined)?.();for(const {slot,work} of effects)slot.cleanup=work();return result;}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();harness.slots=[];harness.effects=[];
 const target=new EventTarget();Object.assign(target,{setTimeout,clearTimeout,setInterval,clearInterval});vi.stubGlobal("window",target);
 const doc=new EventTarget();Object.assign(doc,{visibilityState:"visible"});vi.stubGlobal("document",doc);vi.stubGlobal("navigator",{onLine:true});
 harness.settings.mockResolvedValue({...defaultNotificationSettings(),enabled:true});harness.cases.mockResolvedValue([]);harness.reconcile.mockResolvedValue([]);harness.source.mockResolvedValue({lessons:[],obligations:[],warnings:[],loaded_at:"fresh"});
});
afterEach(()=>{for(const slot of harness.slots)(slot.cleanup as (()=>void)|undefined)?.();vi.unstubAllGlobals();vi.useRealTimers();});
it("immediately drains a queued refresh after the source changes during a pending read",async()=>{
 let release!:(value:ReturnType<typeof defaultNotificationSettings>)=>void;
 harness.settings.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 render();await vi.advanceTimersByTimeAsync(1);expect(harness.settings).toHaveBeenCalledOnce();
 const next={tutorPreferences:{absence_message_template:"new"}} as DemoSnapshot;render(next);await vi.advanceTimersByTimeAsync(1);
 release({...defaultNotificationSettings(),enabled:true});await vi.advanceTimersByTimeAsync(2);
 expect(harness.settings).toHaveBeenCalledTimes(2);expect(harness.source).toHaveBeenCalledOnce();
 const context=render(next).props.value;expect(context.loading).toBe(false);expect(context.absenceTemplate).toBe("new");
});
it("does not apply or schedule a late response after unmount",async()=>{
 let release!:(value:ReturnType<typeof defaultNotificationSettings>)=>void;
 harness.settings.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 render();await vi.advanceTimersByTimeAsync(1);for(const slot of harness.slots){(slot.cleanup as (()=>void)|undefined)?.();slot.cleanup=undefined;}
 release(defaultNotificationSettings());await vi.advanceTimersByTimeAsync(2);
 expect(harness.source).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it("does not repopulate a replaced source cache when an old reconciliation finishes late",async()=>{
 let release!:(value:unknown[])=>void;
 harness.reconcile.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 render();await vi.advanceTimersByTimeAsync(1);expect(harness.reconcile).toHaveBeenCalledOnce();
 const next={tutorPreferences:{absence_message_template:"latest"}} as DemoSnapshot;render(next);await vi.advanceTimersByTimeAsync(1);
 release([{id:"obsolete"}]);await vi.advanceTimersByTimeAsync(2);
 expect(harness.settings).toHaveBeenCalledTimes(2);expect(harness.reconcile).toHaveBeenCalledTimes(2);
 const context=render(next).props.value;expect(context.cases).toEqual([]);expect(context.loading).toBe(false);expect(context.absenceTemplate).toBe("latest");
});
it("reconciles recovered coverage even when the new alert list is still empty",async()=>{
 const data={lessons:[],obligations:[],warnings:[],loaded_at:"fresh"};
 harness.source.mockResolvedValueOnce({...data,coverage:{manual:false,attendance:[],activities:[]}}).mockResolvedValue({...data,coverage:{manual:true,attendance:[],activities:[]}});
 render();await vi.advanceTimersByTimeAsync(1);expect(harness.reconcile).toHaveBeenCalledOnce();
 await render().props.value.refresh();
 expect(harness.reconcile).toHaveBeenCalledTimes(2);expect(harness.reconcile.mock.calls[1][2]).toEqual({manual:true,attendance:[],activities:[]});
});
