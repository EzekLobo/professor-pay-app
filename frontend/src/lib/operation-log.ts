export const operationLabels = {
  kodland_sync: "Sincronização Kodland",
  kodland_auto_sync: "Verificação automática Kodland",
  notifications_refresh: "Atualização dos alertas",
  notifications_settings: "Configuração dos alertas",
  notifications_contact: "Confirmação de contato",
  task_save: "Salvar tarefa local",
  task_sync: "Enviar tarefas para a nuvem",
  task_lists: "Salvar listas locais",
  task_delete: "Excluir tarefa local",
  browser_runtime: "Funcionamento da interface",
} as const;
export type OperationName = keyof typeof operationLabels;
export const statusLabels = { running: "Em andamento", success: "Concluído", warning: "Atenção", error: "Falhou" } as const;
export type OperationStatus = keyof typeof statusLabels;
export const errorLabels = {
  network: "Falha de conexão", timeout: "Tempo de resposta excedido", permission_denied: "Permissão insuficiente",
  unauthenticated: "Sessão expirada", invalid_credentials: "Acesso Kodland inválido", rate_limited: "Limite de consultas atingido",
  persistence: "Falha ao gravar os dados", invalid_data: "Dados inválidos", sync_incomplete: "Aguardando sincronização completa",
  credentials_missing: "Acesso Kodland não salvo", groups_missing: "Turmas ainda não importadas", unexpected: "Falha não identificada",
} as const;
export type OperationErrorCode = keyof typeof errorLabels;
export type OperationLogInput = {
  id: string; operation: OperationName; status: OperationStatus;
  scope?: "essential" | "schedule" | "corrections" | "profiles" | "complete";
  trigger?: "manual" | "automatic"; errorCode?: OperationErrorCode; reference?: string;
  pathname?: string; durationMs?: number; version?: number; errorType?: "Error" | "TypeError" | "ReferenceError" | "RangeError" | "SyntaxError" | "FirebaseError"; counts?: Partial<Record<"groups" | "students" | "lessons" | "activities" | "progress" | "attendance" | "alerts" | "pending" | "warnings", number>>;
};
export type OperationLogRow = OperationLogInput & { userId: string; receivedAt: string; updatedAt: string; origin: "client" };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const paths = new Set(["/dashboard", "/payments", "/classes", "/lessons", "/corrections", "/tasks", "/settings", "/data", "/admin", "/login"]);
const countNames = new Set(["groups", "students", "lessons", "activities", "progress", "attendance", "alerts", "pending", "warnings"]);
/** Strict allowlist: no free text, stack, URL, request body or arbitrary metadata. */
export function validateOperationLog(input: unknown): OperationLogInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Registro inválido.");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["id", "operation", "status", "scope", "trigger", "errorCode", "reference", "pathname", "durationMs", "counts", "version", "errorType"].includes(key))
    || typeof value.id !== "string" || !uuid.test(value.id)
    || typeof value.operation !== "string" || !Object.hasOwn(operationLabels, value.operation)
    || typeof value.status !== "string" || !Object.hasOwn(statusLabels, value.status)) throw new Error("Registro inválido.");
  if (value.scope !== undefined && !["essential", "schedule", "corrections", "profiles", "complete"].includes(String(value.scope))) throw new Error("Escopo inválido.");
  if (value.trigger !== undefined && !["manual", "automatic"].includes(String(value.trigger))) throw new Error("Origem inválida.");
  if (value.errorCode !== undefined && (typeof value.errorCode !== "string" || !Object.hasOwn(errorLabels, value.errorCode))) throw new Error("Código inválido.");
  if (value.reference !== undefined && (typeof value.reference !== "string" || !uuid.test(value.reference))) throw new Error("Referência inválida.");
  if (value.pathname !== undefined && (typeof value.pathname !== "string" || !paths.has(value.pathname))) throw new Error("Página inválida.");
  if (value.durationMs !== undefined && (!Number.isInteger(value.durationMs) || Number(value.durationMs) < 0 || Number(value.durationMs) > 3600000)) throw new Error("Duração inválida.");
  if (value.version !== undefined && (!Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 9999999999)) throw new Error("Versão inválida.");
  if (value.errorType !== undefined && !["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "FirebaseError"].includes(String(value.errorType))) throw new Error("Tipo inválido.");
  if (value.counts !== undefined) {
    if (!value.counts || typeof value.counts !== "object" || Array.isArray(value.counts) || Object.entries(value.counts).some(([key, count]) => !countNames.has(key) || !Number.isInteger(count) || Number(count) < 0 || Number(count) > 1000000)) throw new Error("Contagens inválidas.");
  }
  // Rebuild rather than preserve prototype properties.
  return JSON.parse(JSON.stringify(value)) as OperationLogInput;
}
export function classifyOperationError(error: unknown): OperationErrorCode {
  try {
  const value = error && typeof error === "object" ? error as { code?: unknown; name?: unknown; message?: unknown; status?: unknown } : {};
  const text = `${String(value.code ?? "")} ${String(value.name ?? "")} ${String(value.message ?? "")}`.toLowerCase();
  if (/incompleta|durante a leitura/.test(text)) return "sync_incomplete";
  if (/kodlandsyncpersistence|não foi possível concluir a (leitura|gravação)|quota|resource-exhausted/.test(text)) return "persistence";
  if (/senha da kodland inválid|invalid.credentials/.test(text)) return "invalid_credentials";
  if (value.status === 429 || /rate.limit|limitou temporariamente|too-many/.test(text)) return "rate_limited";
  if (value.status === 401 || /unauthenticated|sessão.*expir|auth\/(?:user-token-expired|invalid-user-token|user-disabled|requires-recent-login)/.test(text)) return "unauthenticated";
  if (value.status === 403 || /permission|permissão|forbidden/.test(text)) return "permission_denied";
  if (/timeout|timed.out|tempo.*exced|demorou além|aborterror/.test(text)) return "timeout";
  if (/network|fetch|offline|conectar|internet/.test(text)) return "network";
  if (/inválid|invalid|informe|obrigatóri/.test(text)) return "invalid_data";
  return "unexpected";
  } catch { return "unexpected"; }
}
export function operationErrorReference(error: unknown) {
  try {
  const reference = error && typeof error === "object" ? (error as { syncId?: unknown }).syncId : undefined;
  return typeof reference === "string" && uuid.test(reference) ? reference : undefined;
  } catch { return undefined; }
}
export function safeOperationPath(pathname: string | undefined) { return pathname && paths.has(pathname) ? pathname : undefined; }

export function operationErrorType(error: unknown): OperationLogInput["errorType"] {
  try {
  if (!(error instanceof Error)) return undefined;
  return ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "FirebaseError"].includes(error.name) ? error.name as OperationLogInput["errorType"] : "Error";
  } catch { return undefined; }
}
