import { expect, it } from "vitest";
import { syncedCollectionsChanged } from "./synced-collections";
it("does not invalidate screens for timestamps or ordering alone",()=>{
 const before={reviews:[{id:"a",state:"submitted",created_at:"old"},{id:"b",state:"missing"}]};
 expect(syncedCollectionsChanged(before,{reviews:[before.reviews[1],{...before.reviews[0],created_at:"new",updated_at:"new"}]})).toBe(false);
});
it("detects meaningful edits, insertions and deletions",()=>{
 const before={reviews:[{id:"a",state:"submitted"}]};
 expect(syncedCollectionsChanged(before,{reviews:[{id:"a",state:"corrected"}]})).toBe(true);
 expect(syncedCollectionsChanged(before,{reviews:[]})).toBe(true);
 expect(syncedCollectionsChanged(before,{...before,attendance:[{id:"p",status:"ABSENT"}]})).toBe(true);
});
