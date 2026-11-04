import { expect, it } from "vitest";
import { kodlandDocumentChanged } from "./kodland-write-diff";
it("compara conteúdo profundo sem depender da ordem das chaves ou horário de consulta",()=>{
 expect(kodlandDocumentChanged({id:"a",name:"A",created_at:"old",updated_at:"old",tasks:[{title:"T",url:"u"}]},{tasks:[{url:"u",title:"T"}],name:"A",id:"a",created_at:"old",updated_at:"new"})).toBe(false);
});
it("detecta criação, alterações, remoção de campo e de atividade",()=>{
 expect(kodlandDocumentChanged(undefined,{id:"a"})).toBe(true);
 expect(kodlandDocumentChanged({id:"a",status:"missing"},{id:"a",status:"delivered"})).toBe(true);
 expect(kodlandDocumentChanged({id:"a",tasks:["one"]},{id:"a",tasks:[]})).toBe(true);
 expect(kodlandDocumentChanged({id:"a",old:true},{id:"a"})).toBe(true);
});
it("preenche data de criação ausente uma vez e não trata estado false como ausente",()=>{
 expect(kodlandDocumentChanged({id:"a"},{id:"a",created_at:"new"})).toBe(true);
 expect(kodlandDocumentChanged({id:"a",hidden:false},{id:"a",hidden:true})).toBe(true);
});
