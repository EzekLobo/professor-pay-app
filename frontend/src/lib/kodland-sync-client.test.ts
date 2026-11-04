import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { requestKodlandJson, watchKodlandSync, readKodlandLocal } from "./kodland-sync-client";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const id = "6619087b-bcaa-42e8-b34b-cee7eaf985cb";
it("limita resposta de rede, aborta transporte e preserva referência", async () => {
 const fetch = vi.fn((url: string, init: RequestInit) => { expect(url).toBe("/api/kodland/sync"); expect(init.signal).toBeDefined(); return new Promise<Response>(() => {}); });vi.stubGlobal("fetch",fetch);
 const pending=requestKodlandJson({},async()=>"token",id,20);
 const rejected=expect(pending).rejects.toMatchObject({status:504,syncId:id});
 await vi.advanceTimersByTimeAsync(21);await rejected;
 expect(fetch.mock.calls[0][1].signal!.aborted).toBe(true);
});
it("token atrasado não dispara consulta depois do timeout", async () => {
 let finish!: (value:string)=>void;
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 const pending=requestKodlandJson({},()=>new Promise<string>(resolve=>{finish=resolve;}),id,20);
 const rejected=expect(pending).rejects.toMatchObject({status:504});
 await vi.advanceTimersByTimeAsync(21);await rejected;
 finish("late-token");await vi.advanceTimersByTimeAsync(0);expect(fetch).not.toHaveBeenCalled();
});
it("limita também um corpo de resposta travado", async () => {
 vi.stubGlobal("fetch",vi.fn(async()=>({ headers:new Headers({"content-type":"application/json"}),status:200,ok:true,json:()=>new Promise(()=>{}) })));
 const pending=requestKodlandJson({},async()=>"token",id,20);
 const rejected=expect(pending).rejects.toMatchObject({status:504});await vi.advanceTimersByTimeAsync(21);await rejected;
});
it("mantém leitura de erro estruturado do servidor", async () => {
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({code:"invalid_credentials"}),{status:401,headers:{"content-type":"application/json"}})));
 await expect(requestKodlandJson({},async()=>"token",id,20)).rejects.toMatchObject({status:401,syncId:id});
});
it("encerra espera sem progresso e impede novas etapas tardias", async () => {
 let resume!:()=>void;const next=vi.fn();const progress=vi.fn();
 const pending=watchKodlandSync(async report=>{report("Gravando aulas");await new Promise<void>(resolve=>{resume=resolve;});report("Próxima etapa");next();},progress,20);
 const rejected=expect(pending).rejects.toThrow("Gravando aulas");await vi.advanceTimersByTimeAsync(21);await rejected;
 resume();await vi.advanceTimersByTimeAsync(0);expect(next).not.toHaveBeenCalled();expect(progress).not.toHaveBeenCalledWith("Próxima etapa");
});
it("reinicia prazo por etapa em sincronização longa com progresso", async () => {
 const pending=watchKodlandSync(async report=>{await new Promise(resolve=>setTimeout(resolve,15));report("Segunda etapa");await new Promise(resolve=>setTimeout(resolve,15));return 42;},()=>{},20);
 await vi.advanceTimersByTimeAsync(31);await expect(pending).resolves.toBe(42);
});

it("leitura Firebase parada informa etapa/referência e descarta continuação tardia", async () => {
 let resume!: (value:number)=>void;const write=vi.fn();
 const pending=readKodlandLocal(()=>new Promise<number>(resolve=>{resume=resolve;}),id,"Leitura de extras",20).then(write);
 const rejected=expect(pending).rejects.toMatchObject({syncId:id,code:"deadline-exceeded",message:expect.stringContaining("Leitura de extras")});
 await vi.advanceTimersByTimeAsync(21);await rejected;
 resume(42);await vi.advanceTimersByTimeAsync(0);expect(write).not.toHaveBeenCalled();
});

it("erro de leitura preserva referência e permissão sem vazar mensagem interna", async () => {
 await expect(readKodlandLocal(async()=>{throw {code:"permission-denied",message:"sensitive-internal-payload"};},id,"Leitura de alunos",20)).rejects.toMatchObject({syncId:id,code:"permission-denied",message:expect.stringContaining("recusou o acesso")});
});
