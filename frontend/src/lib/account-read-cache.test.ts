import { expect, it, vi } from "vitest";
import { AccountReadCache } from "./account-read-cache";
it("shares reads only for the same account and revalidates after expiry", async () => {
 let now = 1000; const cache = new AccountReadCache(() => now), read = vi.fn(async () => ({ value: 1 }));
 const [a,b] = await Promise.all([cache.read("a",100,read,()=>true),cache.read("a",100,read,()=>true)]);
 expect(read).toHaveBeenCalledOnce(); expect(a).toBe(b);
 await cache.read("b",100,read,()=>true); expect(read).toHaveBeenCalledTimes(2);
 now += 101; await cache.read("a",100,read,()=>true); expect(read).toHaveBeenCalledTimes(3);
});
it("does not resurrect invalidated in-flight data and discards failures", async () => {
 const cache = new AccountReadCache(); let release!: (value:number)=>void;
 const old = cache.read("a",10000,()=>new Promise<number>(done=>{release=done;}),()=>true);
 await Promise.resolve(); cache.invalidate("a");
 expect(await cache.read("a",10000,async()=>2,()=>true)).toBe(2); release(1); await old;
 expect(await cache.read("a",10000,async()=>3,()=>true)).toBe(2);
 await expect(cache.read("b",10000,async()=>{throw Error("offline");},()=>true)).rejects.toThrow("offline");
 expect(await cache.read("b",10000,async()=>4,()=>true)).toBe(4);
});
it("rejects a late response after the account changes", async () => {
 let owner = true; const cache = new AccountReadCache();
 const pending = cache.read("a",1000,async()=>{owner=false;return "private";},()=>owner);
 await expect(pending).rejects.toThrow("conta conectada mudou");
 owner=true;expect(await cache.read("a",1000,async()=>"fresh-a",()=>owner)).toBe("fresh-a");
});
