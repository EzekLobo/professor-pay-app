"use client";
import { subscribeTutorPreferencesChanged } from "@/lib/tutor-preference-events";
import { setAutomaticPayrollEnabled } from "@/lib/auto-sync-payroll";
import { automaticTasks, attendanceConfirmed, type AutomaticTaskState } from "@/lib/kodland-sync-policy";
import { subscribeStudentNotifications } from "@/lib/student-notification-store";
import { KodlandAutoSyncBusyError, kodlandAutoSyncAvailable } from "@/lib/kodland-sync-lock";
import { readKodlandLocal, watchKodlandSync } from "@/lib/kodland-sync-client";
import { classifyOperationError } from "@/lib/operation-log";
import { reportOperation } from "@/lib/operation-log-client";
import { useEffect, useState } from "react";
import { kodlandApi, tutorPreferencesApi, type KodlandExtraLesson, type KodlandGroup, type KodlandLesson, type KodlandStudent } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { getFirebaseAuth } from "@/lib/firebase";
import { createKodlandAutoSync, type AutoSyncStatus } from "@/lib/kodland-auto-sync";

/** Runs only for authenticated accounts, while a visible tab has connectivity. */
export function useKodlandAutoSync(uid: string, demo: boolean, pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  const [status, setStatus] = useState<AutoSyncStatus>({ phase: "idle" });
  useEffect(() => {
    if (demo) return;
    let disposed = false;
    let ticking = false;
    let enabledOverride: boolean | null = null;
    let preferencesRevision = 0;
    const accountOwner = () => !disposed && getFirebaseAuth().currentUser?.uid === uid;
    const owner = () => accountOwner() && enabledOverride !== false;
    let cache: { until: number; groups: KodlandGroup[]; lessons: KodlandLesson[]; extras: KodlandExtraLesson[]; students: KodlandStudent[]; states: Record<string, AutomaticTaskState>; updatedAt: Record<string, string>; blockedGroups: string[]; schedule: string | null } | null = null;
    let automaticRunning = false;
    let disabledUntil = 0;
    let previousPathname = pathname;
    let currentPathname = pathname;
    let agendaEntryPending = previousPathname === "/dashboard";
    let readyAt = Date.now() + 30000;
    const recordingAttemptsThisVisit = new Set<string>();
    const unsubscribe = subscribeStudentNotifications(change => { if (change === "source" && !automaticRunning) { cache = null; disabledUntil = 0; } });
    const synchronize = async (credentials: { username: string; password: string }, mode: "schedule" | "classroom" | "corrections", groupId?: string, scope?: "attendance" | "activities") => {
      if (!owner()) return;
      automaticRunning = true;
      try {
        return await watchKodlandSync((report, assertActive) => kodlandApi.sync(credentials.username, credentials.password, mode, { automatic: true, correctionGroupIds: groupId ? [groupId] : undefined, refreshSchedule: false, followupScope: scope, onProgress: report, assertActive: () => { assertActive(); if (!owner()) throw new KodlandAutoSyncBusyError("A integração Kodland foi desligada."); } }), message => { if (owner()) setStatus({ phase: "syncing", message }); });
      } finally { automaticRunning = false; }
    };
    const scoped = async (credentials: { username: string; password: string }, input: Parameters<typeof kodlandApi.syncScope>[2]) => {
      automaticRunning = true;
      try { return await kodlandApi.syncScope(credentials.username, credentials.password, input, undefined, { automatic: true, assertActive: () => { if (!owner()) throw new KodlandAutoSyncBusyError("A integração Kodland foi desligada."); } }); }
      finally { automaticRunning = false; }
    };
    const controller = createKodlandAutoSync({
      owner,
      available: () => document.visibilityState === "visible" && navigator.onLine && kodlandAutoSyncAvailable(uid),
      context: async () => {
        const revision = preferencesRevision;
        if (!owner() || disabledUntil > Date.now()) return { enabled: false, groups: [], updatedAt: {} };
        if (!cache || cache.until <= Date.now()) {
          const preferences = await readKodlandLocal(() => tutorPreferencesApi.get(), crypto.randomUUID(), "Preferências da atualização automática");
          const enabled = revision === preferencesRevision ? preferences.kodland_enabled : enabledOverride;
          if (!owner() || !enabled) { disabledUntil = Date.now() + 6 * 3600000; return { enabled: false, groups: [], updatedAt: {} }; }
          const [groups, state, lessons, extras, students, states, schedule] = await readKodlandLocal(() => Promise.all([kodlandApi.groups(), kodlandApi.followupState(), kodlandApi.lessons(), kodlandApi.extraLessons(), kodlandApi.students(), kodlandApi.automaticState(), kodlandApi.scheduleLastUpdatedAt()]), crypto.randomUUID(), "Contexto da atualização automática");
          if (!owner() || revision !== preferencesRevision) return { enabled: false, groups: [], updatedAt: {} };
          cache = { until: Date.now() + 6 * 3600000, groups: groups.items, lessons: lessons.items, extras: extras.items, students: students.items, states, schedule, ...state };
        }
        const agendaEntry = agendaEntryPending;
        const tasks = automaticTasks(Date.now(), cache.groups, cache.lessons, cache.students, cache.states, cache.schedule, cache.extras, agendaEntry, currentPathname === "/dashboard", recordingAttemptsThisVisit);
        return { enabled: owner(), groups: cache.groups.filter(group => !group.archived).map(group => group.external_id), updatedAt: cache.updatedAt, blockedGroups: cache.blockedGroups, tasks };
      },
      credentials: restoreKodlandCredentials,
      sync: async (groupId, credentials) => {
        await synchronize(credentials, "corrections", groupId, "activities");
        if (cache && owner()) { cache.updatedAt[groupId] = new Date().toISOString(); cache.blockedGroups = cache.blockedGroups.filter(id => id !== groupId); }
      },
      runTask: async (task, credentials) => {
        if ((task.kind === "extras_discovery" || task.kind === "recordings") && currentPathname !== "/dashboard") return;
        if (!cache || !owner()) return;
        const current = cache;
        const attempted = { attempts: (current.states[task.id]?.attempts ?? 0) + 1, at: new Date().toISOString(), complete: false };
        // Reserve before the remote request, so reloads and failed requests consume an attempt too.
        current.states[task.id] = attempted;
        await kodlandApi.saveAutomaticTask(task.id, attempted);
        if (!owner()) return;
        let classroomComplete = false;
        let recordingComplete = false;
        let extraCheckComplete = false;
        try {
          if (task.kind === "extras_discovery") {
            agendaEntryPending = false;
            await scoped(credentials, { scope: "extras_discovery", week_date: task.weekDate, known_extra_ids: task.knownExtraIds, time_zone: "America/Sao_Paulo" });
            const latestExtras = await readKodlandLocal(() => kodlandApi.extraLessons(), crypto.randomUUID(), "Aulas extras atualizadas");
            if (owner()) current.extras = latestExtras.items;
          } else if (task.kind === "classroom") {
            const result = await scoped(credentials, { scope: "call_link", time_zone: "America/Sao_Paulo", occurrence: task.occurrence });
            classroomComplete = result.complete && Boolean(result.call_url);
            if (result.call_url) {
              const row = task.occurrence.kind === "lesson" ? current.lessons.find(item => item.id === task.occurrence.id) : current.extras.find(item => item.id === task.occurrence.id);
              if (row) { row.call_url = result.call_url; row.call_occurrence_key = result.occurrence_key; }
            }
          } else if (task.kind === "recordings") {
            recordingAttemptsThisVisit.add(task.id);
            const result = await scoped(credentials, { scope: "recordings", time_zone: "America/Sao_Paulo", occurrence: task.occurrence });
            recordingComplete = result.complete && Boolean(result.recording_url);
            if (result.recording_url) {
              const row = task.occurrence.kind === "lesson" ? current.lessons.find(item => item.id === task.occurrence.id) : current.extras.find(item => item.id === task.occurrence.id);
              if (row) row.recording_url = result.recording_url;
            }
          } else if (task.kind === "extra_final_check") {
            const result = await scoped(credentials, { scope: "extra_final_check", time_zone: "America/Sao_Paulo", occurrence: task.occurrence });
            extraCheckComplete = result.complete && typeof result.final_completed === "boolean";
            const row = current.extras.find(item => item.id === task.occurrence.id);
            if (row && extraCheckComplete) {
              row.final_checked_at = new Date().toISOString();
              if (row.manual_status !== "DONE" && row.manual_status !== "ACCOUNTED") { row.completed = result.final_completed!; if (result.final_completed) row.manual_status = "DONE"; }
            }
          } else {
            await synchronize(credentials, "corrections", task.groupId, "attendance");
          }
        } catch (reason) {
          if (reason instanceof KodlandAutoSyncBusyError && owner()) {
            const cancelled = { ...attempted, attempts: attempted.attempts - 1, at: "", complete: false };
            await kodlandApi.saveAutomaticTask(task.id, cancelled);
            current.states[task.id] = cancelled;
          }
          throw reason;
        }
        if (!owner()) return;
        const complete = task.kind === "classroom" ? classroomComplete
          : task.kind === "recordings" ? recordingComplete
            : task.kind === "extra_final_check" ? extraCheckComplete
              : task.kind === "extras_discovery" ? true
                : task.kind === "attendance" && Boolean(task.lesson && attendanceConfirmed(task.lesson, task.students ?? [], await readKodlandLocal(() => kodlandApi.attendanceForGroup(task.groupId), crypto.randomUUID(), "Confirmação da presença")));
        if (!owner()) return;
        const result = { ...attempted, complete };
        await kodlandApi.saveAutomaticTask(task.id, result);
        if (!owner()) return;
        current.states[task.id] = result;
      },
      status: value => { if (owner()) {
        setStatus(value);
        if (value.phase === "credentials" || value.phase === "empty") reportOperation("kodland_auto_sync", "warning", { trigger: "automatic", errorCode: value.phase === "credentials" ? "credentials_missing" : "groups_missing" }, 15 * 60000);
        if (value.phase === "error") reportOperation("kodland_auto_sync", "error", { trigger: "automatic", errorCode: classifyOperationError({ message: value.message }) });
      } },
    });
    const tick = async () => {
      if (Date.now() < readyAt || ticking || disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      ticking = true;
      const run = async () => {
        if (disposed) return;
        await controller.tick({ active: document.visibilityState === "visible", online: navigator.onLine, following: ["/corrections", "/classes"].includes(currentPathname) });
      };
      try {
        if (navigator.locks) await navigator.locks.request(`nexusclass:kodland-auto:${uid}`, { ifAvailable: true }, lock => lock ? run() : Promise.resolve());
        else await run();
      } finally { ticking = false; }
    };
    const routeChanged = (event: Event) => {
      const nextPath = (event as CustomEvent<string>).detail;
      if (typeof nextPath === "string" && nextPath !== previousPathname) {
        currentPathname = nextPath;
        if (nextPath === "/dashboard") { agendaEntryPending = true; recordingAttemptsThisVisit.clear(); cache = null; readyAt = Math.min(readyAt, Date.now()); }
        if (previousPathname === "/dashboard" && nextPath !== "/dashboard") { agendaEntryPending = false; recordingAttemptsThisVisit.clear(); }
        previousPathname = nextPath;
      }
      readyAt = Math.min(readyAt, Date.now());
      void tick().catch(() => undefined);
    };
    const unsubscribePreferences = subscribeTutorPreferencesChanged(uid, change => {
      if (!accountOwner()) return;
      preferencesRevision++;
      enabledOverride = change.kodland_enabled;
      setAutomaticPayrollEnabled(uid, change.kodland_enabled);
      cache = null;
      disabledUntil = change.kodland_enabled ? 0 : Number.POSITIVE_INFINITY;
      if (!change.kodland_enabled) setStatus({ phase: "disabled" });
    });
    const invalidate = (event: StorageEvent) => { if (event.key === `nexusclass:kodland-change:${uid}`) { cache = null; disabledUntil = 0; } };
    window.addEventListener("storage", invalidate);
    window.addEventListener("nexusclass:kodland-route", routeChanged);
    const run = () => { void tick().catch(() => undefined); };
    const first = window.setTimeout(run, 30000);
    const interval = window.setInterval(run, 30000);
    window.addEventListener("focus", run); window.addEventListener("online", run); document.addEventListener("visibilitychange", run);
    return () => { disposed = true; unsubscribe(); unsubscribePreferences(); window.removeEventListener("storage", invalidate); window.removeEventListener("nexusclass:kodland-route", routeChanged); clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
    // Keep one scheduler per account; path changes arrive through the route event below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, demo]);
  useEffect(() => { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nexusclass:kodland-route", { detail: pathname })); }, [pathname]);
  return status;
}
