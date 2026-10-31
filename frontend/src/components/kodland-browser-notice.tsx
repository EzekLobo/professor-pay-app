"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readKodlandBrowser } from "@/lib/kodland-browser-cache";
import { subscribeStudentNotifications } from "@/lib/student-notification-store";
export function KodlandBrowserNotice({ uid }: { uid: string }) {
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    if (uid === "demo-profile") return;
    let alive = true;
    const refresh = () => { void readKodlandBrowser(uid).then(state => { if (alive) setUpdated(state?.active ? state.updatedAt : ""); }).catch(() => undefined); };
    refresh();
    const unsubscribe = subscribeStudentNotifications(refresh);
    window.addEventListener("storage", refresh);
    return () => { alive = false; unsubscribe(); window.removeEventListener("storage", refresh); };
  }, [uid]);
  if (!updated) return null;
  return <p className="notice" role="status">Dados Kodland salvos somente neste navegador. Dados próprios e pagamentos continuam no Firebase. <Link href="/settings#data">Gerenciar sincronização</Link></p>;
}
