"use client";

import Link from "next/link";
import { HeaderDropdown } from "./header-dropdown";
import { useEffect, useId, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui";
import { latestReleaseVersion, RELEASE_NOTES, unreadReleaseNotes, type ReleaseNote, type ReleaseNotesStore } from "@/lib/release-notes";
import { releaseNotesStore } from "@/lib/release-notes-store";

type Props = { userId: string; store?: ReleaseNotesStore; notes?: readonly ReleaseNote[]; autoShow?: boolean; blocked?: boolean; routeHref?: (href: string) => string };
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

export function ReleaseNotes(props: Props) {
  return <ReleaseNotesContent key={props.userId} {...props} />;
}

function ReleaseNotesContent({ userId, store = releaseNotesStore, notes = RELEASE_NOTES, autoShow = true, blocked = false, routeHref = (href) => href }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [seen, setSeen] = useState<number | null>(null);
  const [mode, setMode] = useState<"unread" | "all" | null>(null);
  const [presented, setPresented] = useState(false);
  const unseen = seen === null ? [] : unreadReleaseNotes(seen, notes);
  const latest = latestReleaseVersion(notes);
  const visible = mode === "unread" ? unseen : unreadReleaseNotes(0, notes);

  useEffect(() => {
    let active = true;
    void store.load(userId).then((value) => { if (active) setSeen(value); }).catch(() => { if (active) setSeen(0); });
    return () => { active = false; };
  }, [store, userId]);

  useEffect(() => {
    if (!autoShow || blocked || seen === null || unseen.length === 0 || presented || mode !== null) return;
    const showWhenReady = () => {
      if (document.visibilityState === "hidden" || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], .notifications-dropdown')) return;
      setPresented(true); setMode("unread");
    };
    const first = window.setTimeout(showWhenReady, 0);
    const timer = window.setInterval(showWhenReady, 300);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [autoShow, blocked, seen, unseen.length, presented, mode]);


  function close() {
    setSeen(Math.max(seen ?? 0, latest)); setMode(null); setPresented(true);
    void store.markSeen(userId, latest).catch(() => undefined);
  }

  return <div className="notifications-anchor">
    <button ref={trigger} aria-expanded={mode !== null} aria-controls={panelId} className="button button-ghost header-news-button" type="button" disabled={seen === null} aria-label={`Abrir novidades${unseen.length ? `: ${unseen.length} não lidas` : ""}`} title="Novidades" onClick={() => { if (mode !== null) close(); else { setPresented(true); setMode("all"); } }}>
      <Sparkles size={18} aria-hidden="true" /><span>Novidades</span>{unseen.length > 0 && <i className="news-unread-dot" aria-hidden="true" />}
    </button>
    <HeaderDropdown open={mode !== null} id={panelId} label="Novidades do NexusClass" trigger={trigger} onClose={close}>
      <div className="notifications-heading"><h2>Novidades</h2><button type="button" aria-label="Fechar notificações" title="Fechar notificações" onClick={close}><X size={18} aria-hidden="true" /></button></div>
      <div className="notifications-scroll">
      <p className="muted release-notes-intro">{mode === "unread" ? "Confira as melhorias que você ainda não viu." : "Veja as últimas melhorias da aplicação."}</p>
      <ol className="release-notes-list">{visible.map((note) => <li key={note.version}>
        <time dateTime={note.date}>{dateFormat.format(new Date(`${note.date}T12:00:00Z`))}</time>
        <h3>{note.title}</h3><p>{note.description}</p>
        <Link href={routeHref(note.href)} onClick={() => { close(); if (note.href === "/settings#notifications") window.dispatchEvent(new Event("nexusclass:open-notification-settings")); }}>{note.action}<span aria-hidden="true"> →</span></Link>
      </li>)}</ol>
      {visible.length === 0 && <p className="muted">Nenhuma novidade publicada por enquanto.</p>}
      </div><div className="release-notes-actions"><Button type="button" className="button-small" onClick={close}>Entendi</Button></div>
    </HeaderDropdown>
  </div>;
}
