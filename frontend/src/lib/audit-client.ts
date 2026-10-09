"use client";

import { getFirebaseAuth } from "@/lib/firebase";

type AuditAction = "start" | "heartbeat" | "end" | "page_view";

async function post(action: AuditAction, sessionId: string, pathname?: string) {
  const user = getFirebaseAuth().currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  await fetch("/api/audit", {
    method: "POST",
    keepalive: action === "end",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, sessionId, pathname }),
  });
}

export const startAccessSession = (sessionId: string) => post("start", sessionId);
export const heartbeatAccessSession = (sessionId: string) => post("heartbeat", sessionId);
export const endAccessSession = (sessionId: string) => post("end", sessionId);
export const trackPageView = (sessionId: string, pathname: string) => post("page_view", sessionId, pathname);
