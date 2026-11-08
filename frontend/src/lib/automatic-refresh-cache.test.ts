import { afterEach, expect, it, vi } from "vitest";
import { activityRowInScope, activityWindow, markRefreshed, refreshDue, resetAutomaticRefreshCache } from "./automatic-refresh-cache";
import type { KodlandLesson } from "./kodland-lessons";
import type { KodlandTaskProgress } from "./kodland-task-progress";
afterEach(()=>{resetAutomaticRefreshCache();vi.unstubAllGlobals();});
it("separates accounts and domains and expires successful checks",()=>{
 vi.stubGlobal("localStorage", {getItem:()=>null,setItem:()=>{throw Error("blocked");}});
 markRefreshed("a","agenda",1000);
 expect(refreshDue("a","agenda",100,1050)).toBe(false);
 expect(refreshDue("a","agenda",100,1100)).toBe(true);
 expect(refreshDue("b","agenda",100,1050)).toBe(true);
 expect(refreshDue("a","activities",100,1050)).toBe(true);
});
it("rechecks the last four lessons plus corrections still pending, retaining closed history",()=>{
 const lessons = Array.from({length:8},(_,i)=>({external_class_id:"g",source_lesson_id:`l${i}`,lesson_date:`2026-11-${String(i+1).padStart(2,"0")}`,lesson_number:i+1})) as KodlandLesson[];
 const progress = lessons.map((_,i)=>({external_class_id:"g",lesson_id:`l${i}`,state:i===0?"submitted":"corrected"})) as KodlandTaskProgress[];
 const plan = activityWindow("g",lessons,progress,"2026-11-08")!;
 expect(plan.refresh).toEqual(["l7","l6","l5","l4","l0"]);expect(plan.known).toHaveLength(8);
 expect(activityWindow("other",lessons,progress,"2026-11-08")).toBeUndefined();
});
it("partial snapshots cannot erase unrelated lessons or groups",()=>{
 const groups=new Set(["g"]),windows={g:["recent"]};
 expect(activityRowInScope({external_class_id:"g",lesson_id:"old"},groups,windows)).toBe(false);
 expect(activityRowInScope({external_class_id:"g",lesson_id:"recent"},groups,windows)).toBe(true);
 expect(activityRowInScope({external_class_id:"other",lesson_id:"recent"},groups,windows)).toBe(false);
 expect(activityRowInScope({external_class_id:"g",lesson_id:"old"},groups)).toBe(true);
});
