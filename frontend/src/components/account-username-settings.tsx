"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AtSign } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { getFirebaseAuth } from "@/lib/firebase";
import { normalizeLoginUsername, validLoginUsername } from "@/lib/login-username";

type UsernameAdapter = { get(): Promise<string>; save(username: string): Promise<string> };
async function accountRequest(username?: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Faça login para continuar.");
  const response = await fetch("/api/account/username", {
    method: username === undefined ? "GET" : "PATCH",
    cache: "no-store",
    headers: { authorization: `Bearer ${await user.getIdToken()}`, ...(username === undefined ? {} : { "content-type": "application/json" }) },
    ...(username === undefined ? {} : { body: JSON.stringify({ username }) }),
  });
  const payload = await response.json() as { username?: string; message?: string };
  if (!response.ok || typeof payload.username !== "string") throw new Error(payload.message ?? "Não foi possível carregar seu nick.");
  return payload.username;
}
const accountAdapter: UsernameAdapter = { get: () => accountRequest(), save: accountRequest };

export function AccountUsernameSettings({ adapter = accountAdapter }: { adapter?: UsernameAdapter }) {
  const [username, setUsername] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void adapter.get().then((value) => {
      if (active) { setSaved(value); setUsername(value); setError(""); }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar seu nick."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adapter, retry]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || saved === null) return;
    const value = validLoginUsername(username);
    setNotice("");
    if (!value) { setError("Use de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado."); return; }
    setBusy(true); setError("");
    try {
      const result = await adapter.save(value);
      setSaved(result); setUsername(result);
      setNotice(`Nick salvo. Você já pode entrar como ${result}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar seu nick."); }
    finally { setBusy(false); }
  }
  return <section className="panel settings-section settings-account" aria-label="Acesso à conta">
    <div className="settings-section-heading"><span className="settings-section-icon"><AtSign size={19} aria-hidden="true" /></span><div><h3>Acesso à conta</h3><p>Escolha um nick único para entrar no lugar do e-mail.</p></div></div>
    <form className="account-username-form" onSubmit={save} aria-busy={loading || busy}>
      <label htmlFor="account-username">Nick de acesso</label>
      <div className="account-username-controls"><Input id="account-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" required placeholder={loading ? "Carregando…" : "professor.ana"} disabled={loading || busy || saved === null} value={username} aria-describedby="account-username-help" onChange={(event) => { setUsername(event.target.value); setError(""); setNotice(""); }} /><Button type="submit" className="button-small" disabled={loading || busy || saved === null || normalizeLoginUsername(username) === saved}>{busy ? "Salvando…" : "Salvar nick"}</Button></div>
      <small id="account-username-help" className="muted">3 a 30 caracteres, sem espaços ou acentos. O e-mail continua válido para entrar e recuperar a senha.</small>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {saved === null && !loading && <Button type="button" className="button-ghost button-small" onClick={() => { setLoading(true); setError(""); setRetry((value) => value + 1); }}>Tentar novamente</Button>}
    {notice && <p className="notice" role="status">{notice}</p>}
  </section>;
}
