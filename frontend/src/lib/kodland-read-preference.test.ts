import { expect, it, vi } from "vitest";
import { kodlandReadPreference } from "./kodland-read-preference";
it("does not let an active browser cache override an explicit disabled integration",async()=>{
 expect(await kodlandReadPreference(async()=>({kodland_enabled:false}),true)).toEqual({kodland_enabled:false});
});
it("uses local data only for service unavailability, not a rejected account",async()=>{
 expect(await kodlandReadPreference(async()=>{throw Error("quota");},true)).toEqual({kodland_enabled:true});
 await expect(kodlandReadPreference(async()=>{throw Error("quota");},false)).rejects.toThrow("quota");
 for(const reason of [{status:401},{status:403},{code:"unauthenticated"},{code:"permission-denied"}])await expect(kodlandReadPreference(async()=>{throw reason;},true)).rejects.toBe(reason);
});
it("retains offline fallback when preferences never answer",async()=>{
 vi.useFakeTimers();try{const pending=kodlandReadPreference(()=>new Promise(()=>undefined),true);await vi.advanceTimersByTimeAsync(3000);expect(await pending).toEqual({kodland_enabled:true});}finally{vi.useRealTimers();}
});
