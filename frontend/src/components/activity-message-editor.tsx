"use client";
import { useRef } from "react";
import { Button } from "./ui";
import { DEFAULT_ACTIVITY_MESSAGE } from "@/lib/student-notification-rules";

const examples: Record<string, string> = { responsavel: "Maria", aluno: "Ana", turma: "Programação", aula: "M1L2", data: "31/10/2026", atividades: "Projeto da aula, exercício de revisão", prazo: "02/11/2026" };
export function ActivityMessageEditor({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const input = useRef<HTMLTextAreaElement>(null);
  function insert(key: string) {
    const field = input.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? start;
    const token = `{${key}}`;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + token.length, start + token.length); });
  }
  return <div className="activity-message-editor">
    <label className="field">Mensagem de atividades<textarea ref={input} aria-label="Mensagem de atividades" className="input" required rows={5} maxLength={5000} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} /></label>
    <div className="activity-message-variables" aria-label="Inserir variável na mensagem">{Object.keys(examples).map(key => <button key={key} type="button" disabled={disabled} aria-label={`Inserir {${key}}`} title={`Inserir {${key}}`} onClick={() => insert(key)}><code>{`{${key}}`}</code></button>)}</div>
    <div className="activity-message-tools"><details><summary>Prévia da mensagem</summary><p>{value.replace(/\{([a-z_]+)\}/g, (token, key: string) => examples[key] ?? token)}</p><small>Exemplo fictício. O envio sempre exige sua revisão.</small></details><Button type="button" className="button-ghost button-small" disabled={disabled} onClick={() => onChange(DEFAULT_ACTIVITY_MESSAGE)}>Restaurar mensagem padrão</Button></div>
  </div>;
}
