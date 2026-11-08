import { expect, it } from "vitest";
import { reuseSyncedRows } from "./reuse-synced-rows";
it("preserves arrays and unchanged rows across timestamp-only refreshes",()=>{
 const old=[{id:"one",state:"missing",created_at:"old"},{id:"two",state:"corrected",created_at:"old"}];
 expect(reuseSyncedRows(old,old.map(row=>({...row,created_at:"new"})))).toBe(old);
 const changed=reuseSyncedRows(old,[{...old[0],state:"submitted"},old[1]]);
 expect(changed[0]).not.toBe(old[0]); expect(changed[1]).toBe(old[1]);
 expect(reuseSyncedRows(old,[old[1]])).toEqual([old[1]]);
});
