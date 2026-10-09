"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Button, Input } from "@/components/ui";
import { Shell } from "@/components/shell";
import { getFirebaseAuth } from "@/lib/firebase";

type Analytics = {
  generatedAt: string;
  periodDays: number;
  summary: { users: number; activeNow: number; activeSeconds: number; pageViews: number };
  users: Array<{
    id: string; name: string; email: string; lastSeenAt: string | null;
    activeSeconds: number; sessions: number; active: boolean;
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
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createNotice, setCreateNotice] = useState("");

  const load = useCallback(async (periodDays = days) => {
    setLoading(true);
    setError("");
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("Faça login para continuar.");
      const response = await fetch(`/api/admin/analytics?days=${periodDays}`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json() as Analytics | { message?: string };
      if (!response.ok) throw new Error("message" in payload ? payload.message : "Não foi possível carregar o painel.");
      setData(payload as Analytics);
    } catch (reason) {
      setData(null);
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changePeriod = (value: number) => {
    setDays(value);
    void load(value);
  };

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setCreateError("");
    setCreateNotice("");
    try {
      const current = getFirebaseAuth().currentUser;
      if (!current) throw new Error("Faça login para continuar.");
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await current.getIdToken()}`,
        },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      const payload = await response.json() as { message?: string; user?: { email: string } };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível cadastrar o usuário.");
      event.currentTarget.reset();
      setCreateNotice(`Acesso liberado para ${payload.user?.email ?? "o novo usuário"}.`);
      await load();
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Não foi possível cadastrar o usuário.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="management-grid admin-dashboard">
      <section className="page-heading">
        <p className="eyebrow">Acessos e adoção</p>
        <h1>Administração</h1>
        <p className="muted">Acompanhe quem usa o NexusClass, quando esteve ativo e quais áreas recebem mais acessos.</p>
      </section>
      <div className="admin-periods" role="group" aria-label="Período do relatório">
        {[7, 30, 90].map((value) => (
          <button className={value === days ? "button button-primary" : "button secondary"} key={value} type="button" onClick={() => changePeriod(value)}>
            {value} dias
          </button>
        ))}
        <Button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Atualizando…" : "Atualizar"}</Button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="panel admin-user-form-panel">
        <div className="admin-panel-heading"><div><h2>Cadastrar usuário</h2><p className="muted">Crie o acesso por e-mail e informe a senha inicial ao usuário por um canal seguro.</p></div></div>
        <form className="form admin-user-form" onSubmit={createUser}>
          <label className="field">Nome<Input name="name" required minLength={2} maxLength={100} disabled={creating} autoComplete="name" /></label>
          <label className="field">E-mail<Input name="email" type="email" required disabled={creating} autoComplete="email" /></label>
          <label className="field">Senha inicial<Input name="password" type="password" required minLength={10} disabled={creating} autoComplete="new-password" /></label>
          <Button type="submit" disabled={creating}>{creating ? "Cadastrando…" : "Cadastrar usuário"}</Button>
        </form>
        {createError && <p className="form-error" role="alert">{createError}</p>}
        {createNotice && <p className="notice" role="status">{createNotice}</p>}
      </section>
      {loading && !data ? <p className="muted">Carregando indicadores…</p> : data && <>
        <section className="metric-grid admin-metric-grid" aria-label="Resumo de acesso">
          <article className="metric-card"><span>Usuários cadastrados</span><strong>{data.summary.users}</strong></article>
          <article className="metric-card metric-success"><span>Ativos agora</span><strong>{data.summary.activeNow}</strong><small>atividade nos últimos 2 minutos</small></article>
          <article className="metric-card"><span>Tempo ativo estimado</span><strong>{duration(data.summary.activeSeconds)}</strong></article>
          <article className="metric-card"><span>Acessos a páginas</span><strong>{data.summary.pageViews}</strong></article>
        </section>
        <section className="panel admin-panel">
          <div className="admin-panel-heading"><div><h2>Usuários e último acesso</h2><p className="muted">Tempo ativo calculado por atividade em primeiro plano; não mede tempo com a página minimizada.</p></div><small>Atualizado {dateTime.format(new Date(data.generatedAt))}</small></div>
          {data.users.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Último acesso</th><th>Tempo ativo</th><th>Sessões</th><th>Status</th></tr></thead><tbody>{data.users.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.email}</small></td><td>{item.lastSeenAt ? dateTime.format(new Date(item.lastSeenAt)) : "—"}</td><td>{duration(item.activeSeconds)}</td><td>{item.sessions}</td><td><span className={item.active ? "admin-status active" : "admin-status"}>{item.active ? "Ativo agora" : "Offline"}</span></td></tr>)}</tbody></table></div> : <p className="muted">Ainda não há acessos registrados neste período.</p>}
        </section>
        <section className="panel admin-panel">
          <div className="admin-panel-heading"><div><h2>Funcionalidades mais acessadas</h2><p className="muted">Contagem de visitas às áreas do aplicativo no período selecionado.</p></div></div>
          {data.features.length ? <ol className="admin-feature-list">{data.features.map((item) => <li key={item.feature}><span>{item.feature}</span><strong>{item.views} acesso{item.views === 1 ? "" : "s"}</strong></li>)}</ol> : <p className="muted">Ainda não há funcionalidades acessadas neste período.</p>}
        </section>
      </>}
    </div>
  );
}

export default function AdminPage() {
  return <AuthGuard>{(user) => <Shell user={user}><AdminContent /></Shell>}</AuthGuard>;
}
