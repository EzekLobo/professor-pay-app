"use client";
import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import { clearKodlandStoragePolicy, type KodlandStorage } from "@/lib/kodland-storage-policy";
import { Button } from "./ui";
export function KodlandStorageAdmin() {
  const [storage, setStorage] = useState<KodlandStorage>("browser");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const request = async (method: "GET" | "PUT", selected?: KodlandStorage) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new Error("Faça login para continuar.");
    const response = await fetch("/api/kodland/policy", { method, headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, ...(method === "PUT" ? { body: JSON.stringify({ storage: selected }) } : {}), signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    if (getFirebaseAuth().currentUser?.uid !== user.uid) throw new Error("A conta conectada mudou.");
    if (!response.ok) throw new Error(body.message ?? "Não foi possível salvar a configuração.");
    return body.storage as KodlandStorage;
  };
  useEffect(() => {
    let alive = true;
    void request("GET").then(value => { if (alive) setStorage(value); }).catch(reason => { if (alive) setError(reason.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  return <section className="panel"><h2>Sincronização Kodland</h2><p className="muted">Defina onde os dados da Kodland serão salvos para todos os usuários. Login, configurações e dados próprios continuam no Firebase. Alterações são aplicadas nas próximas sincronizações. A atualização da política pode levar até dois minutos com o serviço disponível.</p><form className="form" onSubmit={async event => {
    event.preventDefault(); if (saving) return; setSaving(true); setError(""); setNotice("");
    try { await request("PUT", storage); clearKodlandStoragePolicy(); setNotice("Configuração salva."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setSaving(false); }
  }}><label className="field">Armazenamento<select className="input" value={storage} disabled={loading || saving} onChange={event => { setStorage(event.target.value as KodlandStorage); setNotice(""); }}><option value="browser">Navegador</option><option value="firebase">Firebase</option></select></label>{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}<div className="form-actions"><Button type="submit" disabled={loading || saving}>{saving ? "Salvando…" : "Salvar"}</Button></div></form></section>;
}
