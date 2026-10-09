export class KodlandSyncResponseError extends Error {
  constructor(
    public readonly status: number,
    public readonly contentType: string,
    public readonly syncId: string,
    message: string,
  ) {
    super(`${message} (HTTP ${status || "rede"}; referência ${syncId})`);
  }
}

export class KodlandSyncPersistenceError extends Error {
  constructor(
    public readonly syncId: string,
    phase: "leitura" | "gravação",
    detail = "Tente novamente ou informe a referência ao suporte.",
  ) {
    super(`A Kodland respondeu, mas não foi possível concluir a ${phase} dos dados no NexusClass. ${detail} Referência ${syncId}.`);
  }
}

const validSyncId = (value: string | null) =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;

const statusMessage = (status: number, code?: string) => {
  if (code === "kodland_invalid_credentials")
    return "Usuário ou senha da Kodland inválidos. Confira os dados e tente novamente.";
  if (code === "kodland_rate_limited" || status === 429)
    return "A Kodland limitou temporariamente as tentativas. Aguarde alguns minutos e tente novamente.";
  if (code === "kodland_session_expired")
    return "A sessão da Kodland expirou. Tente sincronizar novamente.";
  if (code === "firebase_session_expired" || status === 401)
    return "Sua sessão do NexusClass expirou. Entre novamente e tente sincronizar.";
  if (status === 400)
    return "Informe o usuário e a senha da Kodland e tente novamente.";
  if (status === 403)
    return "A Kodland recusou o acesso. Confira as credenciais e tente novamente.";
  if (status === 408 || status === 504)
    return "A sincronização demorou além do limite. Aguarde um pouco e tente novamente.";
  if (status === 413)
    return "A resposta da sincronização excedeu o limite do servidor. Informe a referência ao suporte.";
  if (status >= 500)
    return "A sincronização está temporariamente indisponível. Tente novamente em alguns minutos.";
  return "Não foi possível sincronizar. Tente novamente ou informe a referência ao suporte.";
};

export async function readKodlandSyncResponse<T>(response: Response, requestId: string): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "não informado";
  const syncId = validSyncId(response.headers.get("x-sync-id")) ?? requestId;
  if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)) {
    throw new KodlandSyncResponseError(
      response.status,
      contentType,
      syncId,
      statusMessage(response.status),
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new KodlandSyncResponseError(
      response.status,
      contentType,
      syncId,
      "O servidor retornou uma resposta inválida. Tente novamente em alguns minutos.",
    );
  }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "code" in payload
      ? String(payload.code)
      : undefined;
    throw new KodlandSyncResponseError(
      response.status,
      contentType,
      syncId,
      statusMessage(response.status, code),
    );
  }
  if (!payload || typeof payload !== "object" ||
    !["groups", "students", "reviews", "lessons", "extra_lessons", "availability"].every(
      (key) => key in payload && Array.isArray((payload as Record<string, unknown>)[key]),
    )) {
    throw new KodlandSyncResponseError(
      response.status,
      contentType,
      syncId,
      "O servidor retornou dados incompletos. Tente novamente em alguns minutos.",
    );
  }
  return payload as T;
}

export function kodlandSyncNetworkError(syncId: string) {
  return new KodlandSyncResponseError(
    0,
    "não disponível",
    syncId,
    "Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.",
  );
}
