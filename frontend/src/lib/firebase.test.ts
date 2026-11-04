import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ initialize:vi.fn(()=>({transport:"poll"})),get:vi.fn(()=>({transport:"server"})),app:{} }));
vi.mock("firebase/app",()=>({getApps:()=>[mocks.app],getApp:()=>mocks.app,initializeApp:()=>mocks.app}));
vi.mock("firebase/auth",()=>({getAuth:vi.fn()}));
vi.mock("firebase/firestore",()=>({initializeFirestore:mocks.initialize,getFirestore:mocks.get}));
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();
 for(const key of ["API_KEY","AUTH_DOMAIN","PROJECT_ID","STORAGE_BUCKET","MESSAGING_SENDER_ID","APP_ID"]) vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${key}`,"test-config");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("usa polling no navegador uma única vez para evitar streams presos",async()=>{
 vi.stubGlobal("window",{});
 const {getFirebaseDb}=await import("./firebase");
 expect(getFirebaseDb()).toBe(getFirebaseDb());
 expect(mocks.initialize).toHaveBeenCalledTimes(1);
 expect(mocks.initialize).toHaveBeenCalledWith(mocks.app,{experimentalForceLongPolling:true,experimentalAutoDetectLongPolling:false,experimentalLongPollingOptions:{timeoutSeconds:15}});
 expect(mocks.get).not.toHaveBeenCalled();
});
it("não configura opções de navegador no servidor",async()=>{
 vi.stubGlobal("window",undefined);
 const {getFirebaseDb}=await import("./firebase");getFirebaseDb();
 expect(mocks.initialize).not.toHaveBeenCalled();expect(mocks.get).toHaveBeenCalledWith(mocks.app);
});
