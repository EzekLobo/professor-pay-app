"use client";
import { automaticTasks, attendanceConfirmed, type AutomaticTaskState } from "@/lib/kodland-sync-policy";
import { subscribeStudentNotifications } from "@/lib/student-notification-store";
import { KodlandAutoSyncBusyError, kodlandAutoSyncAvailable } from "@/lib/kodland-sync-lock";
import { readKodlandLocal, watchKodlandSync } from "@/lib/kodland-sync-client";
import { classifyOperationError } from "@/lib/operation-log";
import { reportOperation } from "@/lib/operation-log-client";
import { useEffect, useState } from "react";
import { kodlandApi, tutorPreferencesApi, type KodlandGroup, type KodlandLesson, type KodlandStudent } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { getFirebaseAuth } from "@/lib/firebase";
import { createKodlandAutoSync, type AutoSyncStatus } from "@/lib/kodland-auto-sync";

/** Runs only for authenticated accounts, while a visible tab has connectivity. */
export function useKodlandAutoSync(uid: string, demo: boolean) {
  const [status, setStatus] = useState<AutoSyncStatus>({ phase: "idle" });
  useEffect(() => {
    if (demo) return;
    let disposed = false;
    let ticking = false;
    const owner = () => !disposed && getFirebaseAuth().currentUser?.uid === uid;
    let cache: { until: number; groups: KodlandGroup[]; lessons: KodlandLesson[]; students: KodlandStudent[]; states: Record<string, AutomaticTaskState>; updatedAt: Record<string, string>; blockedGroups: string[]; schedule: string | null } | null = null;
    let automaticRunning = false;
    let disabledUntil = 0;
    const unsubscribe = subscribeStudentNotifications(change => { if (change === "source" && !automaticRunning) { cache = null; disabledUntil = 0; } });
    const synchronize = async (credentials: { username: string; password: string }, mode: "schedule" | "classroom" | "corrections", groupId?: string, scope?: "attendance" | "activities") => {
      automaticRunning = true;
      try {
        return await watchKodlandSync((report, assertActive) => kodlandApi.sync(credentials.username, credentials.password, mode, { automatic: true, correctionGroupIds: groupId ? [groupId] : undefined, refreshSchedule: false, followupScope: scope, onProgress: report, assertActive }), message => { if (owner()) setStatus({ phase: "syncing", message }); });
      } finally { automaticRunning = false; }
    };
    const controller = createKodlandAutoSync({
      owner,
      available: () => document.visibilityState === "visible" && navigator.onLine && kodlandAutoSyncAvailable(uid),
      context: async () => {
        if (disabledUntil > Date.now()) return { enabled: false, groups: [], updatedAt: {} };
        if (!cache || cache.until <= Date.now()) {
          const browserOnly = Boolean((await kodlandApi.browserState())?.active);
          const preferences = browserOnly ? { kodland_enabled: true } : await readKodlandLocal(() => tutorPreferencesApi.get(), crypto.randomUUID(), "Preferências da atualização automática");
          if (!owner() || !preferences.kodland_enabled) { disabledUntil = Date.now() + 6 * 3600000; return { enabled: false, groups: [], updatedAt: {} }; }
          const [groups, state, lessons, students, states, schedule] = await readKodlandLocal(() => Promise.all([kodlandApi.groups(), kodlandApi.followupState(), kodlandApi.lessons(), kodlandApi.students(), kodlandApi.automaticState(), kodlandApi.scheduleLastUpdatedAt()]), crypto.randomUUID(), "Contexto da atualização automática");
          if (!owner()) return { enabled: false, groups: [], updatedAt: {} };
          cache = { until: Date.now() + 6 * 3600000, groups: groups.items, lessons: lessons.items, students: students.items, states, schedule, ...state };
        }
        return { enabled: true, groups: cache.groups.filter(group => !group.archived).map(group => group.external_id), updatedAt: cache.updatedAt, blockedGroups: cache.blockedGroups, tasks: automaticTasks(Date.now(), cache.groups, cache.lessons, cache.students, cache.states, cache.schedule) };
      },
      credentials: restoreKodlandCredentials,
      sync: async (groupId, credentials) => {
        await synchronize(credentials, "corrections", groupId, "activities");
        if (cache && owner()) { cache.updatedAt[groupId] = new Date().toISOString(); cache.blockedGroups = cache.blockedGroups.filter(id => id !== groupId); }
      },
      runTask: async (task, credentials) => {
        if (!cache || !owner()) return;
        const current = cache;
        const attempted = { attempts: (current.states[task.id]?.attempts ?? 0) + 1, at: new Date().toISOString(), complete: false };
        // Reserve before the remote request, so reloads and failed requests consume an attempt too.
        current.states[task.id] = attempted;
        await kodlandApi.saveAutomaticTask(task.id, attempted);
        if (!owner()) return;
        try {
          if (task.kind === "daily") await synchronize(credentials, "schedule");
          else if (task.kind === "classroom") await synchronize(credentials, "classroom", task.groupId);
          else if (task.kind === "materials" && task.lesson) await kodlandApi.loadLessonMaterials(task.lesson, credentials.username, credentials.password);
          else await synchronize(credentials, "corrections", task.groupId, "attendance");
        } catch (reason) {
          if (reason instanceof KodlandAutoSyncBusyError && owner()) {
            const cancelled = { ...attempted, attempts: attempted.attempts - 1, at: "", complete: false };
            await kodlandApi.saveAutomaticTask(task.id, cancelled);
            current.states[task.id] = cancelled;
          }
          throw reason;
        }
        if (!owner()) return;
        const complete = task.kind !== "attendance" || Boolean(task.lesson && attendanceConfirmed(task.lesson, task.students ?? [], await readKodlandLocal(() => kodlandApi.attendanceForGroup(task.groupId!), crypto.randomUUID(), "Confirmação da presença")));
        if (!owner()) return;
        const result = { ...attempted, complete };
        await kodlandApi.saveAutomaticTask(task.id, result);
        if (!owner()) return;
        current.states[task.id] = result;
        if (task.kind === "daily") {
          const [groups, lessons, students] = await readKodlandLocal(() => Promise.all([kodlandApi.groups(), kodlandApi.lessons(), kodlandApi.students()]), crypto.randomUUID(), "Agenda atualizada");
          if (!owner()) return;
          current.groups = groups.items; current.lessons = lessons.items; current.students = students.items; current.schedule = result.at;
        }
      },
      status: value => { if (owner()) {
        setStatus(value);
        if (value.phase === "credentials" || value.phase === "empty") reportOperation("kodland_auto_sync", "warning", { trigger: "automatic", errorCode: value.phase === "credentials" ? "credentials_missing" : "groups_missing" }, 15 * 60000);
        if (value.phase === "error") reportOperation("kodland_auto_sync", "error", { trigger: "automatic", errorCode: classifyOperationError({ message: value.message }) });
      } },
    });
    const readyAt = Date.now() + 30000;
    const tick = async () => {
      if (Date.now() < readyAt || ticking || disposed || document.visibilityState !== "visible" || !navigator.onLine) return;
      ticking = true;
      const run = async () => {
        if (disposed) return;
        await controller.tick({ active: document.visibilityState === "visible", online: navigator.onLine, following: window.location.pathname === "/corrections" });
      };
      try {
        if (navigator.locks) await navigator.locks.request(`nexusclass:kodland-auto:${uid}`, { ifAvailable: true }, lock => lock ? run() : Promise.resolve());
        else await run();
      } finally { ticking = false; }
    };
    const invalidate = (event: StorageEvent) => { if (event.key === `nexusclass:kodland-change:${uid}`) { cache = null; disabledUntil = 0; } };
    window.addEventListener("storage", invalidate);
    const run = () => { void tick().catch(() => undefined); };
    const first = window.setTimeout(run, 30000);
    const interval = window.setInterval(run, 30000);
    window.addEventListener("focus", run); window.addEventListener("online", run); document.addEventListener("visibilitychange", run);
    return () => { disposed = true; unsubscribe(); window.removeEventListener("storage", invalidate); clearTimeout(first); clearInterval(interval); window.removeEventListener("focus", run); window.removeEventListener("online", run); document.removeEventListener("visibilitychange", run); };
  }, [uid, demo]);
  return status;
}
