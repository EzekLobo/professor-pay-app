"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Button, Input } from "@/components/ui";
import { Shell } from "@/components/shell";
import { Plus, RefreshCw } from "lucide-react";
import { OperationLogsPanel } from "@/components/operation-logs-panel";
import { getFirebaseAuth } from "@/lib/firebase";

type Analytics = {
  generatedAt: string;
  periodDays: number;
  summary: { users: number; activeNow: number; activeSeconds: number; pageViews: number };
  users: Array<{
    id: string; name: string; email: string; lastSeenAt: string | null;
    activeSeconds: number; sessions: number; active: boolean; disabled: boolean;
    pageVisits: Array<{
      feature: string; pathname: string; startedAt: string | null;
      lastSeenAt: string | null; activeSeconds: number;
    }>;
  }>;
  features: Array<{ feature: string; views: number }>;
};

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const duration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "Menos de 1 min";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}min` : `${minutes} min`;
};

function AdminContent() {
  const requestRef = useRef<AbortController | null>(null);
  const [view, setView] = useState<"users" | "operations">("users");
  const [search, setSearch] = useState("");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [removingUser, setRemovingUser] = useState<Analytics["users"][number] | null>(null);
  const [logUser, setLogUser] = useState<Analytics["users"][number] | null>(null);
  const [removingId, setRemovingId] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [accessUser, setAccessUser] = useState<Analytics["users"][number] | null>(null);
  const [accessPending, setAccessPending] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (periodDays = days) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("Faça login para continuar.");
      const response = await fetch(`/api/admin/analytics?days=${periodDays}`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
        signal: controller.signal,
      });
      const payload = await response.json() as Analytics | { message?: string };
      if (!response.ok) throw new Error("message" in payload ? payload.message : "Não foi possível carregar o painel.");
      if (!controller.signal.aborted) setData(payload as Analytics);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setData(null);
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); requestRef.current?.abort(); };
  }, [load]);

  const changePeriod = (value: number) => {
    setDays(value);

  };

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError("");
    setNotice("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Faça login para continuar.");
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await current.getIdToken()}`,
        },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          username: String(form.get("username") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      const payload = await response.json() as { message?: string; user?: { email: string; username: string } };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível cadastrar o usuário.");
      formElement.reset();
      setCreateOpen(false);
      setNotice(`Acesso liberado para ${payload.user?.username ? `@${payload.user.username}` : payload.user?.email ?? "o novo usuário"}.`);
      await load();
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setCreating(false);
    }
  }

  async function removeUser() {
    const target = removingUser;
    if (!target || removingId) return;
    setRemovingId(target.id);
    setRemoveError("");
    setNotice("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Faça login para continuar.");
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await current.getIdToken()}`,
        },
        body: JSON.stringify({ userId: target.id }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível remover o usuário.");
      setRemovingUser(null);
      setNotice(`Acesso removido para ${target.email || target.name}.`);
      await load();
    } catch (reason) {
      setRemoveError(reason instanceof Error ? reason.message : "Não foi possível remover o usuário.");
    } finally {
      setRemovingId("");
    }
  }

  async function changeAccess() {
    if (!accessUser || accessPending) return;
    setAccessPending(true);
    setAccessError("");
    setNotice("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Faça login para continuar.");
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${await current.getIdToken()}` },
        body: JSON.stringify({ userId: accessUser.id, disabled: !accessUser.disabled }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível alterar o acesso.");
      setNotice(`Acesso ${accessUser.disabled ? "desbloqueado" : "bloqueado"} para ${accessUser.name}.`);
      setAccessUser(null);
      await load();
    } catch (reason) {
      setAccessError(reason instanceof Error ? reason.message : "Não foi possível alterar o acesso.");
    } finally {
      setAccessPending(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filteredUsers = data?.users.filter((item) => `${item.name} ${item.email}`.toLocaleLowerCase("pt-BR").includes(query)) ?? [];
  const userFeatures = logUser ? Object.entries(logUser.pageVisits.reduce<Record<string, number>>((counts, visit) => {
    counts[visit.feature] = (counts[visit.feature] ?? 0) + 1;
    return counts;
  }, {})).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="management-grid admin-dashboard page-fill-grid">
      <div className="admin-section-switch" role="group" aria-label="Área da administração"><Button type="button" className="button-ghost" aria-pressed={view === "users"} onClick={() => setView("users")}>Usuários</Button><Button type="button" className="button-ghost" aria-pressed={view === "operations"} onClick={() => setView("operations")}>Diagnóstico</Button></div>
      <Modal
        open={createOpen}
        title="Cadastrar usuário"
        className="admin-user-modal"
        onClose={() => !creating && setCreateOpen(false)}
      >
        <p className="muted">Crie um nick simples para o acesso e informe a senha inicial ao usuário por um canal seguro.</p>
        {createError && <p className="form-error" role="alert">{createError}</p>}
        <form className="form management-form admin-user-form" onSubmit={createUser}>
          <label className="field field-wide">Nome<Input name="name" required minLength={2} maxLength={100} disabled={creating} autoComplete="name" /></label>
          <label className="field">Nick<Input name="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" disabled={creating} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="professor.ana" /></label>
          <label className="field">E-mail<Input name="email" type="email" required disabled={creating} autoComplete="email" /></label>
          <label className="field">Senha inicial<Input name="password" type="password" required minLength={10} placeholder="Pelo menos 10 caracteres" disabled={creating} autoComplete="new-password" /></label>
          <div className="form-actions">
            <button className="button button-ghost" type="button" disabled={creating} onClick={() => setCreateOpen(false)}>Cancelar</button>
            <Button type="submit" disabled={creating}>{creating ? "Cadastrando…" : "Cadastrar usuário"}</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(removingUser)}
        title="Remover usuário"
        className="admin-remove-modal"
        onClose={() => !removingId && setRemovingUser(null)}
      >
        {removingUser && <>
          <p>Deseja remover o acesso de <strong>{removingUser.name}</strong> ({removingUser.email})?</p>
          <p className="muted">A pessoa perderá o acesso imediatamente. Os registros de auditoria continuam preservados.</p>
          {removeError && <p className="form-error" role="alert">{removeError}</p>}
          <div className="form-actions admin-remove-actions">
            <button className="button button-ghost" type="button" disabled={Boolean(removingId)} onClick={() => setRemovingUser(null)}>Cancelar</button>
            <button className="button button-danger" type="button" disabled={Boolean(removingId)} onClick={() => void removeUser()}>
              {removingId ? "Removendo…" : "Remover usuário"}
            </button>
          </div>
        </>}
      </Modal>
      <Modal open={Boolean(accessUser)} title={accessUser?.disabled ? "Desbloquear acesso" : "Bloquear acesso"} className="admin-remove-modal" onClose={() => !accessPending && setAccessUser(null)}>
        {accessUser && <>
          <p>{accessUser.disabled ? "Liberar novamente o acesso de" : "Bloquear temporariamente o acesso de"} <strong>{accessUser.name}</strong>?</p>
          <p className="muted">{accessUser.disabled ? "A pessoa poderá entrar novamente com as mesmas credenciais." : "A conta e os dados serão preservados. Você pode desbloquear o acesso a qualquer momento."}</p>
          {accessError && <p className="form-error" role="alert">{accessError}</p>}
          <div className="form-actions admin-remove-actions"><Button type="button" className="button-ghost" disabled={accessPending} onClick={() => setAccessUser(null)}>Cancelar</Button><Button type="button" disabled={accessPending} onClick={() => void changeAccess()}>{accessPending ? "Salvando…" : accessUser.disabled ? "Desbloquear acesso" : "Bloquear acesso"}</Button></div>
        </>}
      </Modal>
      <Modal
        open={Boolean(logUser)}
        title={logUser ? `Atividade de ${logUser.name}` : "Atividade do usuário"}
        className="admin-log-modal"
        onClose={() => setLogUser(null)}
      >
        {logUser && <>
          <p className="muted">Últimos {data?.periodDays ?? days} dias · {logUser.email || "E-mail não informado"}</p>
          <div className="admin-activity-summary"><span><strong>{duration(logUser.activeSeconds)}</strong> de atividade</span><span><strong>{logUser.sessions}</strong> sessões</span></div>
          <section className="admin-user-features" aria-label="Funcionalidades mais acessadas">
            <h3>Funcionalidades mais acessadas</h3>
            {userFeatures.length ? <ol className="admin-feature-list">{userFeatures.map(([feature, views]) => <li key={feature}><div><span>{feature}</span><strong>{views} visita{views === 1 ? "" : "s"}</strong></div><progress value={views} max={userFeatures[0][1]} aria-label={`${feature}: ${views} visitas`} /></li>)}</ol> : <p className="muted">Nenhuma visita registrada neste período.</p>}
          </section>
          <h3>Histórico de páginas</h3>
          {logUser.pageVisits.length ? <div className="admin-table-wrap"><table className="admin-table admin-log-table"><thead><tr><th scope="col">Página</th><th scope="col">Entrada</th><th scope="col">Última atividade</th><th scope="col">Tempo ativo</th></tr></thead><tbody>{logUser.pageVisits.map((visit, index) => <tr key={`${visit.pathname}-${visit.startedAt}-${index}`}><td><strong>{visit.feature}</strong></td><td>{visit.startedAt ? dateTime.format(new Date(visit.startedAt)) : "—"}</td><td>{visit.lastSeenAt ? dateTime.format(new Date(visit.lastSeenAt)) : "—"}</td><td>{duration(visit.activeSeconds)}</td></tr>)}</tbody></table></div> : <p className="muted">Ainda não há visitas de páginas detalhadas neste período.</p>}
        </>}
      </Modal>
      {view === "operations" ? <OperationLogsPanel users={data?.users} /> : <div className="admin-users-view">
      <div className="admin-toolbar">
        <label className="admin-period-select">Período<select className="input" value={days} onChange={(event) => changePeriod(Number(event.target.value))}>{[7, 30, 90].map((value) => <option key={value} value={value}>Últimos {value} dias</option>)}</select></label>
        <div className="admin-toolbar-actions"><Button type="button" className="button-ghost button-small" disabled={loading} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" />{loading ? "Atualizando…" : "Atualizar"}</Button><Button type="button" className="button-small" onClick={() => { setCreateError(""); setCreateOpen(true); }}><Plus size={16} aria-hidden="true" />Cadastrar usuário</Button></div>
      </div>
      {error && <div className="admin-error"><p className="form-error" role="alert">{error}</p><Button type="button" className="button-ghost button-small" disabled={loading} onClick={() => void load()}>Tentar novamente</Button></div>}
      {notice && <p className="notice" role="status">{notice}</p>}
      {loading && !data ? <p className="muted" role="status">Carregando usuários…</p> : data && <>
        <section className="panel admin-panel" aria-busy={loading}>
          <div className="admin-panel-heading"><div className="admin-users-heading"><h2>Usuários <span className="admin-count">{data.summary.users}</span></h2><span className="admin-online-count">{data.summary.activeNow} online</span></div><label className="admin-search"><span className="sr-only">Buscar usuário</span><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome ou e-mail" /></label></div>
          {filteredUsers.length ? <div className="admin-table-wrap"><table className="admin-table admin-users-table"><caption className="sr-only">Usuários cadastrados e acessos nos últimos {days} dias</caption><thead><tr><th scope="col">Usuário</th><th scope="col">Último acesso</th><th scope="col">Ações</th></tr></thead><tbody>{filteredUsers.map((item) => {
            const protectedAccount = item.id === getFirebaseAuth().currentUser?.uid || item.email.toLowerCase() === "ezeklobo.dev@gmail.com";
            return <tr key={item.id}><td><div className="admin-user-identity"><span className={item.active ? "admin-presence active" : "admin-presence"} role="img" aria-label={item.active ? "Online: atividade nos últimos 2 minutos" : "Offline"} /><div><strong>{item.name}</strong><small>{item.email}</small>{item.disabled && <span className="admin-blocked">Acesso bloqueado</span>}</div></div></td><td data-label="Último acesso">{item.lastSeenAt ? dateTime.format(new Date(item.lastSeenAt)) : "Sem acesso no período"}</td><td><div className="admin-user-actions"><button className="button button-ghost admin-remove-user-button" type="button" aria-label={`Ver atividade de ${item.name}`} onClick={() => setLogUser(item)}>Atividade</button>{protectedAccount ? <span className="admin-protected">Administrador</span> : <><button className="button button-ghost admin-remove-user-button" type="button" aria-label={`${item.disabled ? "Desbloquear" : "Bloquear"} acesso de ${item.name}`} onClick={() => { setAccessError(""); setAccessUser(item); }}>{item.disabled ? "Desbloquear" : "Bloquear"}</button><button className="button button-ghost admin-remove-user-button admin-remove-action" type="button" disabled={removingId === item.id} aria-label={`Remover ${item.name}`} onClick={() => { setRemoveError(""); setRemovingUser(item); }}>Remover</button></>}</div></td></tr>;
          })}</tbody></table></div> : <p className="muted admin-empty">{query ? "Nenhum usuário encontrado. Tente outro nome ou e-mail." : "Nenhum usuário cadastrado."}</p>}
        </section>
        <p className="admin-updated">Atualizado {dateTime.format(new Date(data.generatedAt))} · Atividade nos últimos {data.periodDays} dias</p>
      </>}
      </div>}
    </div>
  );
}

export default function AdminPage() {
  return <AuthGuard>{(user) => <Shell key={user.id} user={user}><AdminContent /></Shell>}</AuthGuard>;
}
