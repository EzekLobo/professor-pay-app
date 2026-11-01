"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "./modal";
import { Button } from "./ui";
import { latestReleaseVersion, RELEASE_NOTES, unreadReleaseNotes, type ReleaseNotesStore } from "@/lib/release-notes";
import { localReleaseNotesStore, releaseNotesStore } from "@/lib/release-notes-store";
type NewsContext = { unread: number; open: (restoreFocus?: () => void) => void };
const Context = createContext<NewsContext | null>(null);
export const useReleaseNotes = () => useContext(Context);
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });
export function ReleaseNotesProvider({ userId, routeHref = href => href, children }: { userId: string; routeHref?: (href: string) => string; children: ReactNode }) {
  const store: ReleaseNotesStore = userId === "demo-profile" ? localReleaseNotesStore : releaseNotesStore;
  const [seen, setSeen] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const restore = useRef<(() => void) | undefined>(undefined);
  const latest = latestReleaseVersion(RELEASE_NOTES);
  const visible = unreadReleaseNotes(0, RELEASE_NOTES);
  const unread = seen === null ? 0 : unreadReleaseNotes(seen, RELEASE_NOTES).length;
  useEffect(() => {
    let active = true;
    void store.load(userId).then(value => { if (active) setSeen(value); }).catch(() => { if (active) setSeen(0); });
    return () => { active = false; };
  }, [userId, store]);
  const close = () => {
    setOpen(false); setSeen(Math.max(seen ?? 0, latest));
    void store.markSeen(userId, latest).catch(() => undefined);
    requestAnimationFrame(() => restore.current?.());
  };
  return <Context.Provider value={{ unread, open: focus => { restore.current = focus; setOpen(true); } }}>{children}<Modal open={open} onClose={close} title="Novidades do NexusClass" className="release-notes-modal"><ol className="release-notes-list">{visible.map(note => <li key={note.version}><time dateTime={note.date}>{dateFormat.format(new Date(`${note.date}T12:00:00Z`))}</time><h3>{note.title}</h3><p>{note.description}</p><Link href={routeHref(note.href)} onClick={() => { close(); if (note.href === "/settings#notifications") window.dispatchEvent(new Event("nexusclass:open-notification-settings")); }}>{note.action}<span aria-hidden="true"> →</span></Link></li>)}</ol><div className="release-notes-actions"><Button type="button" onClick={close}>Entendi</Button></div></Modal></Context.Provider>;
}
