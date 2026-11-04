"use client";
import { useEffect, useState } from "react";
import { getAutoSyncRuntime, subscribeAutoSyncSources, subscribeAutoSyncPreferences, type AutoSyncStatus } from "@/lib/auto-sync-runtime";
import { subscribeKodlandCredentialsChanged } from "@/lib/browser-credentials";
import { resetAutomaticPayrollAuthentication, setAutomaticPayrollEnabled } from "@/lib/auto-sync-payroll";
import { subscribeSyncDataChanged } from "@/lib/sync-events";
import { subscribeTutorPreferencesChanged } from "@/lib/tutor-preference-events";

/** Mounted only by the authenticated Shell; the demo ShellFrame never mounts this controller. */
export function AutoSyncController({ uid, pathname }: { uid: string; pathname: string }) {
  const [status, setStatus] = useState<AutoSyncStatus>({ state: "idle", message: "", updatedAt: null });
  useEffect(() => {
    const runtime = getAutoSyncRuntime(uid);
    const detach = runtime.attach(pathname);
    const unsubscribe = runtime.subscribe(setStatus);
    const unsubscribeSources = subscribeAutoSyncSources(uid);
    const unsubscribePreferences = subscribeAutoSyncPreferences(uid);
    const unsubscribePayrollPreferences = subscribeTutorPreferencesChanged(uid, change => setAutomaticPayrollEnabled(uid, change.kodland_enabled));
    const reconnect = () => { resetAutomaticPayrollAuthentication(uid); runtime.reconnect(); };
    const unsubscribeCredentials = subscribeKodlandCredentialsChanged(uid, reconnect);
    const unsubscribeManual = subscribeSyncDataChanged(uid, event => { if (event.scope === "manual") reconnect(); });
    const resume = () => runtime.resume();
    const changed = () => runtime.invalidate();
    window.addEventListener("online", resume); window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("nexusclass:manual-teaching-changed", changed);
    return () => { detach(); unsubscribe(); unsubscribeSources(); unsubscribePreferences(); unsubscribePayrollPreferences(); unsubscribeCredentials(); unsubscribeManual(); window.removeEventListener("online", resume); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); window.removeEventListener("nexusclass:manual-teaching-changed", changed); };
  }, [uid, pathname]);
  if (!status.message || status.state === "idle") return null;
  return <span role="status" aria-live="polite" className="muted auto-sync-status" style={{ display: "block", fontSize: ".8rem", maxWidth: 420, padding: "4px 0" }}>{status.message}</span>;
}
