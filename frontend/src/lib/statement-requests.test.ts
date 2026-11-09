import { expect, it } from "vitest";
import { StatementRequests } from "./statement-requests";
it("does not cancel a pending open when a financial event arrives",()=>{
 const requests=new StatementRequests();const open=requests.open("2026-11-15");
 expect(requests.refresh(null)).toBeNull();expect(requests.refresh("2026-11-15")).toBeNull();
 expect(requests.finishOpen(open)).toBe(true);
});
it("new selections and closing invalidate late opens and follow-up reads",()=>{
 const requests=new StatementRequests();const old=requests.open("2026-11-15");
 const next=requests.open("2026-12-15");expect(requests.finishOpen(old)).toBe(false);expect(requests.finishOpen(next)).toBe(true);
 expect(requests.refresh("2026-11-15")).toBeNull();const refresh=requests.refresh("2026-12-15")!;
 requests.close();expect(requests.current(refresh)).toBe(false);expect(requests.refresh("2026-12-15")).toBeNull();
 const late=requests.open("2027-01-15");requests.close();expect(requests.finishOpen(late)).toBe(false);
});
it("a background refresh cannot override a newer user selection",()=>{
 const requests=new StatementRequests();requests.finishOpen(requests.open("a"));const refresh=requests.refresh("a")!;
 const next=requests.open("b");expect(requests.current(refresh)).toBe(false);expect(requests.refresh("a")).toBeNull();expect(requests.finishOpen(next)).toBe(true);
});

it("a failed new selection leaves the visible statement available for future refreshes",()=>{
 const requests=new StatementRequests();requests.finishOpen(requests.open("a"));
 const failed=requests.open("b");expect(requests.failOpen(failed)).toBe(true);
 expect(requests.refresh("b")).toBeNull();expect(requests.refresh("a")).not.toBeNull();
});
