import { getFirebaseAuth } from "./firebase";
export type KodlandStorage = "browser" | "firebase";
const cache = new Map<string, { storage: KodlandStorage; until: number }>();
export function clearKodlandStoragePolicy() { cache.clear(); }
/** Global admin policy; cached per session/account. A missing policy defaults to browser storage. */
export async function kodlandStoragePolicy(): Promise<KodlandStorage> {
  // API functions also run outside the browser during server-side tooling.
  if (typeof window === "undefined" || !window.location) return "firebase";
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Faça login para continuar.");
  const owner = () => { if (getFirebaseAuth().currentUser?.uid !== user.uid) throw new Error("A conta conectada mudou."); };
  const previous = cache.get(user.uid);
  if (previous && previous.until > Date.now()) { owner(); return previous.storage; }
  const key = `nexusclass:kodland-policy:${user.uid}`;
  let fallback: KodlandStorage = previous?.storage ?? "browser";
  try { const saved = window.localStorage.getItem(key); if (saved === "browser" || saved === "firebase") fallback = saved; } catch {}
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const action = async (): Promise<KodlandStorage> => {
    const token = await user.getIdToken();
    if (controller.signal.aborted) throw new Error("policy_timeout");
    const response = await fetch("/api/kodland/policy", { headers: { authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
    const body = await response.json();
    if (response.status === 401 || response.status === 403) throw Object.assign(new Error("Sua sessão não pôde ser confirmada. Entre novamente."), { status: response.status });
    if (!response.ok || !["browser", "firebase"].includes(body.storage)) throw new Error("policy_unavailable");
    return body.storage;
  };
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("policy_timeout")); }, 3000); });
  let storage: KodlandStorage;
  try { storage = await Promise.race([action(), timeout]); } catch (reason) {
    if (reason && typeof reason === "object" && "status" in reason && [401, 403].includes(Number(reason.status))) throw reason;
    storage = fallback;
  } finally { clearTimeout(timer); }
  owner();
  cache.set(user.uid, { storage, until: Date.now() + 60000 });
  try { window.localStorage.setItem(key, storage); } catch {}
  return storage;
}
