import { KodlandAutoSyncBusyError } from "./kodland-sync-lock";
export type AutoSyncStatus = { phase: "idle" | "paused" | "disabled" | "credentials" | "empty" | "syncing" | "ready" | "error"; updatedAt?: string; message?: string };
export type AutoSyncContext = { enabled: boolean; groups: string[]; updatedAt: Record<string, string>; blockedGroups?: string[] };
export type AutoSyncDependencies = {
  owner: () => boolean;
  available?: () => boolean;
  context: () => Promise<AutoSyncContext>;
  credentials: () => Promise<{ username: string; password: string } | null>;
  sync: (groupId: string, credentials: { username: string; password: string }) => Promise<unknown>;
  status: (value: AutoSyncStatus) => void;
  now?: () => number;
};
/** No timers or credentials persist here. A tick only refreshes existing groups. */
export function createKodlandAutoSync(deps: AutoSyncDependencies) {
  let running = false;
  let failures = 0;
  let retryAt = 0;
  let lastScan = 0;
  let wasFollowing = false;
  const completed: Record<string, string> = {};
  return {
    async tick({ active, online, following }: { active: boolean; online: boolean; following: boolean }) {
      const now = deps.now ?? Date.now;
      if (!active || !online || !deps.owner() || running || now() < retryAt) return;
      if (deps.available?.() === false) { deps.status({ phase: "paused", message: "Atualização automática pausada durante a sincronização manual ou gravação em andamento." }); return; }
      const enteringFollowup = following && !wasFollowing;
      wasFollowing = following;
      if (!enteringFollowup && lastScan && now() - lastScan < 60000) return;
      running = true; lastScan = now();
      try {
        const context = await deps.context();
        if (!deps.owner()) return;
        if (!context.enabled) { deps.status({ phase: "disabled" }); return; }
        if (!context.groups.length) { deps.status({ phase: "empty", message: "Importe suas turmas em Configurações > Dados e backup para iniciar a atualização automática." }); return; }
        const interval = (following ? 5 : 15) * 60000;
        const due = [...new Set(context.groups)].filter(id => {
          if (context.blockedGroups?.includes(id)) return true;
          const stamp = Math.max(Date.parse(context.updatedAt[id] ?? "") || 0, Date.parse(completed[id] ?? "") || 0);
          return !stamp || now() - stamp >= interval;
        });
        if (!due.length) { deps.status({ phase: "ready", updatedAt: Object.values({ ...context.updatedAt, ...completed }).sort().at(-1) }); return; }
        const credentials = await deps.credentials();
        if (!deps.owner()) return;
        if (!credentials) { deps.status({ phase: "credentials", message: "Salve o acesso à Kodland em Configurações > Dados e backup para atualizar presença e atividades automaticamente." }); return; }
        for (let index = 0; index < due.length; index++) {
          if (!deps.owner()) return;
          if (deps.available?.() === false) { deps.status({ phase: "paused", message: "Atualização automática pausada durante a sincronização manual ou gravação em andamento." }); return; }
          deps.status({ phase: "syncing", message: `Atualizando presença e atividades: turma ${index + 1} de ${due.length}…` });
          await deps.sync(due[index], credentials);
          if (!deps.owner()) return;
          completed[due[index]] = new Date(now()).toISOString();
        }
        failures = 0; retryAt = 0;
        deps.status({ phase: "ready", updatedAt: new Date(now()).toISOString() });
      } catch (reason) {
        if (!deps.owner()) return;
        if (reason instanceof KodlandAutoSyncBusyError) { deps.status({ phase: "paused", message: reason.message }); return; }
        failures++;
        retryAt = now() + Math.min(30, 2 ** failures) * 60000;
        deps.status({ phase: "error", message: `${reason instanceof Error ? reason.message : "Não foi possível atualizar a Kodland."} Os dados anteriores foram preservados; uma nova tentativa será feita automaticamente.` });
      } finally { running = false; }
    },
  };
}
