import { KodlandSyncPersistenceError, KodlandSyncResponseError, kodlandSyncNetworkError, readKodlandSyncResponse } from "./kodland-sync-response";
export class KodlandSyncWaitError extends Error { readonly code = "deadline-exceeded"; syncId?: string; }
/** Bounds authentication, transport and response body together; a late token cannot start a request. */
export async function requestKodlandJson<T>(body: object, getToken: () => Promise<string>, syncId: string, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const error = new KodlandSyncResponseError(504, "application/json", syncId, "A consulta à Kodland ficou sem resposta. Verifique sua conexão e tente novamente.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(error); }, timeoutMs); });
  const action = async () => {
    const token = await getToken();
    if (controller.signal.aborted) throw error;
    let response: Response;
    try { response = await fetch("/api/kodland/sync", { method: "POST", signal: controller.signal, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-sync-id": syncId }, body: JSON.stringify(body) }); }
    catch { throw controller.signal.aborted ? error : kodlandSyncNetworkError(syncId); }
    if (controller.signal.aborted) throw error;
    return readKodlandSyncResponse<T>(response, syncId);
  };
  try { return await Promise.race([action(), deadline]); }
  finally { clearTimeout(timer); }
}
/** Stop waiting in the UI, but never release a lock or pretend an in-flight Firestore write was cancelled. */
export async function watchKodlandSync<T>(run: (report: (stage: string, reference?: string) => void, assertActive: () => void) => Promise<T>, onProgress: (stage: string) => void, idleMs = 90_000): Promise<T> {
  let expired = false;
  let stage = "Iniciando sincronização";
  let reference: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectDeadline!: (error: Error) => void;
  const failure = () => Object.assign(new KodlandSyncWaitError(`A etapa “${stage}” ficou sem confirmação. Verifique a conexão. Se a gravação já começou, ela pode terminar em segundo plano; uma nova sincronização aguardará essa gravação.${reference ? ` Referência ${reference}.` : ""}`), { syncId: reference });
  const assertActive = () => { if (expired) throw failure(); };
  const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
  const report = (value: string, syncId?: string) => {
    assertActive(); stage = value; reference = syncId ?? reference; onProgress(value); clearTimeout(timer);
    timer = setTimeout(() => { expired = true; rejectDeadline(failure()); }, idleMs);
  };
  report(stage);
  try { return await Promise.race([Promise.resolve().then(() => run(report, assertActive)), deadline]); }
  finally { clearTimeout(timer); }
}

export class KodlandSyncReadTimeout extends KodlandSyncPersistenceError {
  readonly code = "deadline-exceeded";
  constructor(syncId: string, label: string) { super(syncId, "leitura", `${label}: o Firebase não respondeu no prazo. Verifique o acesso ao banco e tente novamente.`); }
}
/** Reads are safe to stop awaiting: a late result cannot continue the sync. */
export async function readKodlandLocal<T>(read: () => Promise<T>, syncId: string, label: string, timeoutMs = 20_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new KodlandSyncReadTimeout(syncId, label)), timeoutMs); });
  try { return await Promise.race([Promise.resolve().then(read), timeout]); }
  catch (error) {
    if (error instanceof KodlandSyncReadTimeout) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
    const detail = code === "permission-denied" ? "O Firebase recusou o acesso aos dados." : code === "unauthenticated" ? "A sessão do Firebase expirou. Entre novamente." : "Não foi possível ler os dados no Firebase.";
    throw Object.assign(new KodlandSyncPersistenceError(syncId, "leitura", `${label}: ${detail}`), { code: ["permission-denied", "unauthenticated", "unavailable"].includes(code) ? code : "unavailable" });
  }
  finally { clearTimeout(timer); }
}
