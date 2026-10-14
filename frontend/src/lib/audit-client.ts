"use client";

import { getFirebaseAuth } from "@/lib/firebase";

type AuditAction = "start" | "heartbeat" | "end" | "page_view" | "page_leave";
let pendingRequest = Promise.resolve();

function post(action: AuditAction, sessionId: string, pathname?: string, pageVisitId?: string) {
  const request = pendingRequest.then(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/audit", {
      method: "POST",
      keepalive: action === "end",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, sessionId, pathname, pageVisitId }),
    });
  });
  pendingRequest = request.catch(() => undefined);
  return request;
}

export const startAccessSession = (sessionId: string) => post("start", sessionId);
export const heartbeatAccessSession = (sessionId: string, pathname?: string, pageVisitId?: string) => post("heartbeat", sessionId, pathname, pageVisitId);
export const endAccessSession = (sessionId: string, pathname?: string, pageVisitId?: string) => post("end", sessionId, pathname, pageVisitId);
export const trackPageView = (sessionId: string, pathname: string, pageVisitId: string) => post("page_view", sessionId, pathname, pageVisitId);
export const leavePageView = (sessionId: string, pathname: string, pageVisitId: string) => post("page_leave", sessionId, pathname, pageVisitId);
