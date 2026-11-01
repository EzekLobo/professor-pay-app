import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({uid:"a",token:vi.fn(async()=>"token")}));
vi.mock("./firebase",()=>({getFirebaseAuth:()=>({currentUser:{uid:mock.uid,getIdToken:mock.token}})}));
import { clearKodlandStoragePolicy, kodlandStoragePolicy } from "./kodland-storage-policy";
let saved:Map<string,string>;
beforeEach(()=>{mock.uid="a";saved=new Map();clearKodlandStoragePolicy();vi.stubGlobal("window",{location:{},localStorage:{getItem:(key:string)=>saved.get(key),setItem:(key:string,value:string)=>saved.set(key,value)}});});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("segue escolha administrativa e reutiliza política sem consultar por turma",async()=>{
 const fetch=vi.fn(async()=>Response.json({storage:"firebase"}));vi.stubGlobal("fetch",fetch);
 expect(await kodlandStoragePolicy()).toBe("firebase");expect(await kodlandStoragePolicy()).toBe("firebase");expect(fetch).toHaveBeenCalledOnce();
});
it("na indisponibilidade mantém última configuração válida, ou usa navegador se ainda não existir",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>{throw new Error("unavailable");}));expect(await kodlandStoragePolicy()).toBe("browser");
 clearKodlandStoragePolicy();saved.set("nexusclass:kodland-policy:a","firebase");expect(await kodlandStoragePolicy()).toBe("firebase");
});
it("renova configuração expirada e não transforma sessão recusada em sucesso",async()=>{
 let now=100000;vi.spyOn(Date,"now").mockImplementation(()=>now);
 const fetch=vi.fn(async()=>Response.json({storage:"browser"}));vi.stubGlobal("fetch",fetch);await kodlandStoragePolicy();
 now+=60000;fetch.mockResolvedValue(Response.json({storage:"firebase"}));expect(await kodlandStoragePolicy()).toBe("firebase");expect(fetch).toHaveBeenCalledTimes(2);
 clearKodlandStoragePolicy();fetch.mockResolvedValue(Response.json({message:"Login"},{status:401}));await expect(kodlandStoragePolicy()).rejects.toThrow("sessão");
});
it("abandona resposta de uma conta anterior",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>{mock.uid="b";return Response.json({storage:"firebase"});}));
 await expect(kodlandStoragePolicy()).rejects.toThrow("conta");expect(saved.size).toBe(0);
});
