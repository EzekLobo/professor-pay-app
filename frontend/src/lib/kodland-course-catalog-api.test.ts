import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ uid: "a", state: { active: false, collections: {} as Record<string, unknown[]> }, request: vi.fn() }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: mock.uid, getIdToken: async () => "fixture" } }) }));
vi.mock("./kodland-sync-client", () => ({ requestKodlandJson: mock.request }));
vi.mock("./kodland-browser-cache", () => ({ readKodlandBrowser: async () => structuredClone(mock.state), updateKodlandBrowser: async (_uid: string, mutate: (state: typeof mock.state) => void, owner: () => boolean) => { if (!owner()) throw new Error("A conta conectada mudou."); mutate(mock.state); } }));
import { kodlandCourseCatalogApi } from "./kodland-course-catalog-api";
beforeEach(() => { mock.uid = "a"; mock.state = { active: false, collections: { kodland_groups: [{ id: "existing-group" }] } }; mock.request.mockReset(); });
it("caches course metadata without changing active storage or adding fictitious groups", async () => {
  const courses = [{ id: "1192", name: "Roblox", internal_name: "", lesson_count: 0, lessons: [] }];
  mock.request.mockResolvedValue({ courses });
  expect(await kodlandCourseCatalogApi.refresh("fixture", "fixture")).toEqual(courses);
  expect(mock.state.active).toBe(false);
  expect(mock.state.collections.kodland_groups).toEqual([{ id: "existing-group" }]);
  expect(await kodlandCourseCatalogApi.get()).toEqual(courses);
});
it("keeps the last catalog when the request fails and refuses a late response after changing accounts", async () => {
  mock.state.collections.kodland_course_catalog = [{ id: "1192", lessons: [] }];
  mock.request.mockRejectedValueOnce(new Error("offline"));
  await expect(kodlandCourseCatalogApi.refresh("fixture", "fixture")).rejects.toThrow("offline");
  expect(mock.state.collections.kodland_course_catalog).toEqual([{ id: "1192", lessons: [] }]);
  mock.request.mockImplementationOnce(async () => { mock.uid = "b"; return { courses: [] }; });
  await expect(kodlandCourseCatalogApi.refresh("fixture", "fixture")).rejects.toThrow("conta conectada mudou");
  expect(mock.state.collections.kodland_course_catalog).toEqual([{ id: "1192", lessons: [] }]);
});
it("shares concurrent catalog requests, reuses a daily cache and allows explicit refresh",async()=>{
 const courses=[{id:"1192",name:"Roblox",internal_name:"",lesson_count:0,lessons:[]}];
 mock.request.mockResolvedValue({courses});
 await Promise.all([kodlandCourseCatalogApi.refresh("fixture","fixture",false),kodlandCourseCatalogApi.refresh("fixture","fixture",false)]);
 expect(mock.request).toHaveBeenCalledOnce();
 await kodlandCourseCatalogApi.refresh("fixture","fixture",false);expect(mock.request).toHaveBeenCalledOnce();
 await kodlandCourseCatalogApi.refresh("fixture","fixture",true);expect(mock.request).toHaveBeenCalledTimes(2);
 mock.state.collections.kodland_catalog_metadata=[{id:"catalog",checked_at:new Date(Date.now()-25*3600000).toISOString()}];
 await kodlandCourseCatalogApi.refresh("fixture","fixture",false);expect(mock.request).toHaveBeenCalledTimes(3);
});
