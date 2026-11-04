import { kodlandApi, tutorPreferencesApi, type KodlandExtraLesson, type KodlandGroup } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { restoreKodlandCredentials, type KodlandCredentials } from "./browser-credentials";
import { getFirebaseAuth } from "./firebase";
import { createStudentNotificationStore } from "./student-notification-store";
import { getSyncCoordinator, type SyncExecutionContext, type SyncOutcome, type SyncJob } from "./sync-coordinator";
import { subscribeSyncDataChanged } from "./sync-events";
import { subscribeTutorPreferencesChanged } from "./tutor-preference-events";
import { attendanceDecision, callLinkDecision, calendarDay, extraFinalCheckDecision, occurrenceKey, occurrenceTimes, recordingDecision, syncTimeZone, withinInitialWindow, type SyncDecision, type SyncOccurrence, type SyncScope } from "./sync-policy";
import { scopedOccurrence, validClassroomUrl, type KodlandScopedOccurrence, type KodlandScopedRequest, type KodlandScopedResult } from "./kodland-scoped-sync";
import { emptySyncState, type SyncIdentity, type SyncState } from "./sync-state";

export type AutoSyncSnapshot = { enabled: boolean; timeZone: string; groups: KodlandGroup[]; lessons: KodlandLesson[]; extras: KodlandExtraLesson[] };
export type AutoSyncStatus = { state: "idle" | "running" | "pending" | "auth_required" | "error"; message: string; updatedAt: number | null };
type Coordinator = { read(identity: SyncIdentity, force?: boolean): Promise<SyncState>; trackedStates?(): Promise<SyncState[]>; initialisedAt(): Promise<number>; enqueue<T>(job: SyncJob<T>): Promise<SyncOutcome<T>> };
export type AutoSyncRuntimeOptions = {
  uid: string; coordinator: Coordinator; currentOwner(): string | null;
  load(): Promise<AutoSyncSnapshot>; credentials(): Promise<KodlandCredentials | null>;
  execute(credentials: KodlandCredentials, request: KodlandScopedRequest, context: SyncExecutionContext): Promise<KodlandScopedResult>;
  available?(): boolean; now?(): number;
  setTimer?(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer?(timer: ReturnType<typeof setTimeout>): void;
};
type Candidate = { identity: SyncIdentity; request: KodlandScopedRequest; item?: SyncOccurrence; decide(state: SyncState, now: number): SyncDecision };
class IntegrationDisabledError extends Error { constructor() { super("Kodland integration is disabled."); this.name = "IntegrationDisabledError"; } }
const MINUTE = 60_000;
const available = () => (typeof document === "undefined" || document.visibilityState !== "hidden") && (typeof navigator === "undefined" || navigator.onLine !== false);
const date = (value: string) => String(value ?? "").slice(0, 10);
const time = (value: string) => /^\d{2}:\d{2}/.test(value ?? "") ? value.slice(0, 5) : value?.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
const cancelled = (status: string) => /cancel|substitution|replacement/i.test(status);
export function autoSyncOccurrence(item: KodlandLesson | KodlandExtraLesson, kind: "lesson" | "extra"): KodlandScopedOccurrence {
  return { kind, id: item.id, group_id: item.external_class_id, source_lesson_id: kind === "lesson" ? (item as KodlandLesson).source_lesson_id || item.id.replace(/^group-[^-]+-lesson-/, "") : item.id,
    lesson_date: date(item.lesson_date), start_time: time(item.start_time), end_time: time(item.end_time),
    ...(kind === "extra" ? { booking_id: (item as KodlandExtraLesson).recording_booking_id, external_student_id: (item as KodlandExtraLesson).external_student_id } : {}) };
}
function policyOccurrence(item: KodlandLesson | KodlandExtraLesson, kind: "lesson" | "extra", zone: string): SyncOccurrence {
  const occurrence = autoSyncOccurrence(item, kind), value = scopedOccurrence(occurrence);
  return { ...value, cancelled: cancelled(item.status), taught: kind === "extra" && ((item as KodlandExtraLesson).completed || ["DONE", "ACCOUNTED"].includes((item as KodlandExtraLesson).manual_status ?? "")), recordingUrl: item.recording_url,
    callUrl: item.call_occurrence_key === occurrenceKey(value, zone) && validClassroomUrl(item.call_url) ? item.call_url : undefined };
}

/** A single timer and cached candidate snapshot per account; it never polls whole collections. */
export class AutoSyncRuntime {
  private snapshot: AutoSyncSnapshot | null = null;
  private loading: Promise<void> | null = null;
  private dirty = true;
  private integrationOverride: boolean | null = null;
  private preferencesRevision = 0;
  private initialised = 0;
  private route = "";
  private attached = 0;
  private disposed = false;
  private running = false;
  private rerun = false;
  private timer?: ReturnType<typeof setTimeout>;
  private discoveryRequested = false;
  private agendaEnteredAt = 0;
  private readonly recordingVisits = new Set<string>();
  private readonly history = new Map<string, SyncState>();
  private readonly forceReads = new Set<string>();
  private readonly trackedPending = new Set<string>();
  private authPaused = false;
  private authRetryAllowed = false;
  private wakeAt = 0;
  private activities?: Promise<SyncOutcome<KodlandScopedResult>>;
  private readonly listeners = new Set<(status: AutoSyncStatus) => void>();
  private status: AutoSyncStatus = { state: "idle", message: "", updatedAt: null };
  private readonly now: () => number;
  private readonly setTimer: NonNullable<AutoSyncRuntimeOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<AutoSyncRuntimeOptions["clearTimer"]>;
  constructor(private readonly options: AutoSyncRuntimeOptions) {
    this.now = options.now ?? Date.now; this.setTimer = options.setTimer ?? setTimeout; this.clearTimer = options.clearTimer ?? clearTimeout;
  }
  getStatus(): AutoSyncStatus { return this.status; }
  subscribe(listener: (status: AutoSyncStatus) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(state: AutoSyncStatus["state"], message = "") { this.status = { state, message, updatedAt: state === "idle" ? this.now() : this.status.updatedAt }; this.listeners.forEach(listener => listener(this.status)); }
  private owner(): boolean { return !this.disposed && this.options.currentOwner() === this.options.uid; }
  private online(): boolean { return this.owner() && (this.options.available ?? available)(); }
  private integrationEnabled(): boolean { return this.integrationOverride !== false && this.snapshot?.enabled === true; }
  private assertIntegrationEnabled(): void { if (!this.integrationEnabled()) throw new IntegrationDisabledError(); }
  setIntegrationEnabled(enabled: boolean): void {
    if (!this.owner()) return;
    this.integrationOverride = enabled; this.preferencesRevision++; this.dirty = true; this.wakeAt = 0;
    if (this.snapshot) this.snapshot = { ...this.snapshot, enabled };
    if (!enabled) { this.stopTimer(); this.update("idle"); return; }
    if (this.route === "/dashboard") { this.discoveryRequested = true; this.agendaEnteredAt = this.now(); this.recordingVisits.clear(); }
    void this.tick();
  }
  attach(path: string): () => void { this.attached++; this.setPage(path); return () => { this.attached = Math.max(0, this.attached - 1); if (!this.attached) this.stopTimer(); }; }
  setPage(path: string): void {
    const entering = path === "/dashboard" && (this.route !== path || this.attached <= 1);
    this.route = path;
    if (entering) { this.agendaEnteredAt = this.now(); this.discoveryRequested = true; this.recordingVisits.clear(); }
    this.dirty = true;
    void this.tick();
  }
  /** Called on visibility/online/focus; this does not create another recording visit. */
  resume(): void {
    if (this.authPaused || !this.online()) return;
    this.dirty = true; this.wakeAt = 0;
    if (this.integrationOverride === false) { void this.load().then(() => this.tick()).catch(() => { /* A failed preference refresh keeps automatic work disabled. */ }); }
    else void this.tick();
  }
  invalidate(): void { this.dirty = true; if (this.running) this.rerun = true; else void this.tick(); }
  reconnect(): void { this.authPaused = false; this.authRetryAllowed = true; this.history.clear(); this.dirty = true; this.wakeAt = 0; void this.tick(); }
  dispose(): void { this.disposed = true; this.stopTimer(); this.listeners.clear(); }
  private stopTimer(): void { if (this.timer !== undefined) this.clearTimer(this.timer); this.timer = undefined; }
  private schedule(at: number | null): void {
    this.stopTimer();
    if (!this.attached || !this.online() || !this.integrationEnabled() || this.authPaused || at === null || !Number.isFinite(at)) return;
    this.timer = this.setTimer(() => { this.timer = undefined; void this.tick(); }, Math.max(1000, Math.min(at - this.now(), 2_147_000_000)));
  }
  private async load(): Promise<void> {
    if (!this.owner()) return;
    if (this.loading) return this.loading;
    if (this.snapshot && !this.dirty) return;
    this.loading = (async () => {
      const revision = this.preferencesRevision;
      const source = await this.options.load();
      // A post-event read is authoritative; an older in-flight response cannot undo the switch.
      const currentRevision = revision === this.preferencesRevision;
      const snapshot = { ...source, enabled: currentRevision ? source.enabled : this.integrationOverride ?? source.enabled };
      if (currentRevision) this.integrationOverride = null;
      if (!this.owner()) return;
      this.snapshot = { ...snapshot, timeZone: syncTimeZone(snapshot.timeZone) };
      const imported = snapshot.groups.some(group => !group.archived) || snapshot.lessons.length > 0 || snapshot.extras.length > 0;
      if (snapshot.enabled && imported && !this.initialised) {
        const [initialised, pending] = await Promise.all([this.options.coordinator.initialisedAt(), this.options.coordinator.trackedStates?.() ?? Promise.resolve([])]);
        if (!this.owner()) return;
        this.initialised = initialised;
        pending.forEach(state => { if (!state.completed) this.trackedPending.add(state.key); this.history.set(state.key, state); });
      }
      this.dirty = revision !== this.preferencesRevision;
    })().finally(() => { this.loading = null; });
    return this.loading;
  }
  private async state(identity: SyncIdentity, force = false): Promise<SyncState> {
    const refresh = force || this.forceReads.has(identity.key);
    const cached = this.history.get(identity.key); if (cached && !refresh) return cached;
    const state = await this.options.coordinator.read(identity, refresh);
    if (this.owner()) {
      this.history.set(identity.key, state); this.forceReads.delete(identity.key);
      if (["attendance", "recordings"].includes(state.scope)) {
        if (!state.completed && state.last_attempt_at !== null) this.trackedPending.add(state.key);
        else this.trackedPending.delete(state.key);
      }
    }
    return state;
  }
  private async refreshState(identity: SyncIdentity): Promise<void> { await this.state(identity, true); }
  /** A data revision invalidates only its matching metadata, not every card's history. */
  invalidateRevision(scope: SyncScope, resourceId: string, sourceChanged = true): void {
    for (const [key, state] of this.history) if (scope === "manual" || (state.scope === scope && (state.resource_id === resourceId || ["activities", "ranking"].includes(scope)))) this.forceReads.add(key);
    if (sourceChanged) this.dirty = true;
    if (this.running) this.rerun = true; else void this.tick();
  }
  private candidates(): Candidate[] {
    const snapshot = this.snapshot; if (!snapshot?.enabled) return [];
    const zone = snapshot.timeZone, candidates: Candidate[] = [], onAgenda = this.route === "/dashboard";
    for (const [kind, items] of [["lesson", snapshot.lessons], ["extra", snapshot.extras]] as const) {
      for (const row of items) {
        const requestOccurrence = autoSyncOccurrence(row, kind), item = policyOccurrence(row, kind, zone);
        if (!occurrenceTimes(item, zone)) continue;
        const key = occurrenceKey(item, zone);
        const push = (scope: KodlandScopedRequest["scope"], decide: Candidate["decide"]) => candidates.push({ identity: { key: `${scope}:${key}`, scope, resourceId: row.id }, request: { scope, occurrence: requestOccurrence, time_zone: zone }, item, decide });
        if (kind === "lesson" && (withinInitialWindow(item, this.initialised, zone) || this.trackedPending.has(`attendance:${key}`))) push("attendance", (state, now) => attendanceDecision(item, now, state, zone));
        if (kind === "extra" && !(row as KodlandExtraLesson).final_checked_at) push("extra_final_check", (state, now) => extraFinalCheckDecision(item, now, state, zone));
        if (onAgenda) {
          push("call_link", (state, now) => callLinkDecision(item, now, state, zone));
          if ((withinInitialWindow(item, this.initialised, zone) || this.trackedPending.has(`recordings:${key}`) || (this.history.has(`recordings:${key}`) && !item.recordingUrl)) && !this.recordingVisits.has(key)) push("recordings", (state, now) => state.last_attempt_at !== null && state.last_attempt_at !== undefined && !recordingDecision(item, this.agendaEnteredAt, state, zone).due ? { due: false, nextDueAt: null, reason: "next_agenda_entry" } : recordingDecision(item, now, state, zone));
        }
      }
    }
    if (onAgenda && this.discoveryRequested) {
      const identity: SyncIdentity = { key: "extras_discovery:week", scope: "extras_discovery", resourceId: "week" };
      candidates.push({ identity, request: { scope: "extras_discovery", week_date: calendarDay(this.now(), zone), known_extra_ids: snapshot.extras.map(item => item.id), time_zone: zone }, decide: (state, now) => ({ due: !state.next_due_at || now >= state.next_due_at, nextDueAt: state.next_due_at, reason: "agenda_entry" }) });
    }
    const priority = { call_link: 0, attendance: 1, extra_final_check: 2, extras_discovery: 3, recordings: 4, activities: 5, ranking: 6 };
    return candidates.sort((left, right) => priority[left.request.scope] - priority[right.request.scope]);
  }
  private async execute(candidate: Candidate, credentials: KodlandCredentials): Promise<void> {
    const result = await this.options.coordinator.enqueue({ ...candidate.identity, isDue: (state, now) => this.integrationEnabled() && !this.authPaused && candidate.decide(this.authRetryAllowed && state.error_code === "auth_required" ? { ...state, next_due_at: null } : state, now).due,
      run: async context => {
        context.assertCurrent(); this.assertIntegrationEnabled();
        const value = await this.options.execute(credentials, candidate.request, context); context.assertCurrent();
        const wait = candidate.request.scope === "recordings" ? 30 * MINUTE : 5 * MINUTE;
        return { value, completed: value.complete, nextDueAt: value.complete ? null : this.now() + wait, domains: value.domains };
      } });
    if (!this.owner()) return;
    if (result.status !== "skipped") {
      if (candidate.request.scope === "recordings" && candidate.item) this.recordingVisits.add(occurrenceKey(candidate.item, this.snapshot!.timeZone));
      if (candidate.request.scope === "extras_discovery") this.discoveryRequested = false;
      this.apply(candidate, result.value); await this.refreshState(candidate.identity);
    } else {
      // A skipped claim may mean another device already completed this occurrence.
      await this.refreshState(candidate.identity);
      if (candidate.decide(this.history.get(candidate.identity.key)!, this.now()).due) this.wakeAt = Math.max(this.wakeAt, this.now() + MINUTE);
    }
  }
  private apply(candidate: Candidate, value: KodlandScopedResult): void {
    if (!this.snapshot) return;
    if (candidate.request.scope === "extras_discovery") { if (value.updated) this.dirty = true; return; }
    const requested = candidate.request.occurrence; if (!requested) return;
    const collection = requested.kind === "lesson" ? this.snapshot.lessons : this.snapshot.extras;
    const row = collection.find(item => item.id === requested.id); if (!row) return;
    if (value.recording_url) row.recording_url = value.recording_url;
    if (value.call_url) { row.call_url = value.call_url; row.call_occurrence_key = occurrenceKey(scopedOccurrence(requested), this.snapshot.timeZone); }
    if (requested.kind === "extra" && candidate.request.scope === "extra_final_check" && value.complete) { const extra = row as KodlandExtraLesson; extra.final_checked_at = new Date(this.now()).toISOString(); if (value.final_completed) extra.completed = true; }
  }
  async tick(): Promise<void> {
    this.stopTimer();
    if (!this.attached || !this.online() || this.integrationOverride === false || this.authPaused) return;
    if (this.running) { this.rerun = true; return; }
    this.running = true;
    let next: number | null = null;
    const remember = (at: number | null) => { if (at !== null && Number.isFinite(at)) next = next === null ? at : Math.min(next, at); };
    try {
      await this.load(); if (!this.online() || !this.snapshot?.enabled) return;
      const credentials = await this.options.credentials(); if (!this.online()) return;
      if (!credentials) { this.update("pending", "Salve as credenciais da Kodland em Dados e backup para atualizar automaticamente."); return; }
      const candidates = this.candidates();
      const activityIdentity: SyncIdentity = { key: "activities:active_groups", scope: "activities", resourceId: "active_groups" };
      const activityState = await this.state(activityIdentity);
      if (activityState.revision === "ranking_pending" && activityState.last_success_at !== null) {
        const requestedAt = activityState.last_success_at;
        candidates.unshift({ identity: { key: "ranking:active_groups", scope: "ranking", resourceId: "active_groups" },
          request: { scope: "ranking", group_ids: this.snapshot.groups.filter(group => !group.archived).map(group => group.external_id), time_zone: this.snapshot.timeZone },
          decide: (state, now) => ({ due: !(state.completed && state.last_success_at !== null && state.last_success_at >= requestedAt) && (!state.next_due_at || now >= state.next_due_at), nextDueAt: state.completed && state.last_success_at !== null && state.last_success_at >= requestedAt ? null : state.next_due_at, reason: "ranking_pending" }) });
      }
      const priorities = { call_link: 0, ranking: 1, attendance: 2, extra_final_check: 3, extras_discovery: 4, recordings: 5, activities: 6 };
      candidates.sort((left, right) => priorities[left.request.scope] - priorities[right.request.scope]);
      for (const candidate of candidates) {
        if (!this.online() || !this.integrationEnabled() || this.authPaused) break;
        const preliminary = candidate.decide(emptySyncState(candidate.identity), this.now());
        if (!preliminary.due) { remember(preliminary.nextDueAt); continue; }
        let state = await this.state(candidate.identity);
        if (state.error_code === "auth_required" && !this.authRetryAllowed) { this.authPaused = true; this.update("auth_required", "Reconecte a Kodland em Dados e backup."); break; }
        let decision = candidate.decide(this.authRetryAllowed && state.error_code === "auth_required" ? { ...state, next_due_at: null } : state, this.now());
        if (decision.due && this.now() >= this.wakeAt) {
          this.update("running", "Atualizando informações da Kodland…");
          try { await this.execute(candidate, credentials); }
          catch (error) {
            if (!this.owner()) return;
            if (error instanceof IntegrationDisabledError || !this.integrationEnabled()) break;
            await this.refreshState(candidate.identity).catch(() => undefined);
            state = this.history.get(candidate.identity.key) ?? state;
            if (state.error_code === "auth_required" || (error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status)))) { this.authPaused = true; this.update("auth_required", "Reconecte a Kodland em Dados e backup."); break; }
            this.update("error", "Uma atualização ficou pendente. Os dados salvos foram preservados.");
            if (candidate.request.scope === "recordings" && candidate.item) this.recordingVisits.add(occurrenceKey(candidate.item, this.snapshot.timeZone));
          }
          state = this.history.get(candidate.identity.key) ?? state;
          decision = candidate.decide(state, this.now());
        }
        // Recordings wait for another agenda entry after the first attempt, rather than a polling timer.
        if (candidate.request.scope !== "recordings" || !candidate.item || !this.recordingVisits.has(occurrenceKey(candidate.item, this.snapshot.timeZone))) remember(decision.nextDueAt);
      }
      if (this.wakeAt > this.now()) remember(this.wakeAt);
      if (this.status.state === "running") this.update("idle");
    } catch { if (this.owner()) { this.update("error", "A atualização automática ficou pendente."); remember(this.now() + 5 * MINUTE); } }
    finally {
      this.running = false;
      if (this.rerun && this.owner()) { this.rerun = false; remember(this.now() + 1000); }
      this.schedule(next !== null && this.wakeAt > this.now() ? Math.max(next, this.wakeAt) : next);
    }
  }
  /** Every page entry calls this; rerenders/filters do not. Pending work shares one promise. */
  syncActivities(options: { manual?: boolean } = {}): Promise<SyncOutcome<KodlandScopedResult>> {
    if (this.activities) return this.activities;
    const work = (async (): Promise<SyncOutcome<KodlandScopedResult>> => {
      if (options.manual) { this.authPaused = false; this.authRetryAllowed = true; }
      if (!this.online() || this.integrationOverride === false || this.authPaused) return { status: "skipped", reason: "unavailable" };
      await this.load(); if (!this.owner() || !this.snapshot?.enabled) return { status: "skipped", reason: "unavailable" };
      const groupIds = this.snapshot.groups.filter(group => !group.archived).map(group => group.external_id);
      if (!groupIds.length) return { status: "skipped", reason: "unavailable" };
      const credentials = await this.options.credentials();
      if (!credentials) { this.update("pending", "Salve as credenciais da Kodland em Dados e backup."); if (options.manual) throw new Error("Salve as credenciais em Dados e backup antes de atualizar as atividades."); return { status: "skipped", reason: "unavailable" }; }
      const identity: SyncIdentity = { key: "activities:active_groups", scope: "activities", resourceId: "active_groups" };
      const outcome = await this.options.coordinator.enqueue({ ...identity, isDue: (state, now) => this.integrationEnabled() && (options.manual === true || state.status !== "error" || !state.next_due_at || now >= state.next_due_at),
        run: async context => {
          context.assertCurrent(); this.assertIntegrationEnabled();
          const value = await this.options.execute(credentials, { scope: "activities", group_ids: groupIds, time_zone: this.snapshot!.timeZone }, context);
          context.assertCurrent(); return { value, completed: value.ranking_complete !== false, nextDueAt: value.ranking_complete === false ? this.now() + 5 * MINUTE : null, revision: value.ranking_complete === false ? "ranking_pending" : "ranking_ready", domains: value.domains };
        } });
      if (this.owner()) { await this.refreshState(identity); if (outcome.status !== "skipped" && outcome.value.ranking_complete === false) { this.update("pending", "Atividades atualizadas; a pontuação do ranking ficou pendente."); this.schedule(this.now() + 5 * MINUTE); } }
      return outcome;
    })();
    const guarded = work.catch(error => {
      if (error instanceof IntegrationDisabledError) return { status: "skipped", reason: "unavailable" } as const;
      if (this.owner() && error && typeof error === "object" && "status" in error && [401, 403].includes(Number(error.status))) {
        this.authPaused = true; this.stopTimer(); this.update("auth_required", "Reconecte a Kodland em Dados e backup.");
      }
      throw error;
    });
    this.activities = guarded;
    void guarded.finally(() => { if (this.activities === guarded) this.activities = undefined; }).catch(() => undefined);
    return guarded;
  }
}

const runtimes = new Map<string, AutoSyncRuntime>();
export function getAutoSyncRuntime(uid: string): AutoSyncRuntime {
  for (const [owner, runtime] of runtimes) if (owner !== uid) { runtime.dispose(); runtimes.delete(owner); }
  let runtime = runtimes.get(uid);
  if (!runtime) {
    runtime = new AutoSyncRuntime({ uid, coordinator: getSyncCoordinator(uid), currentOwner: () => getFirebaseAuth().currentUser?.uid ?? null,
      load: async () => {
        const [preferences, settings, groups, lessons, extras] = await Promise.all([tutorPreferencesApi.get(), createStudentNotificationStore(uid).settings(), kodlandApi.groups(), kodlandApi.lessons(), kodlandApi.extraLessons()]);
        return { enabled: preferences.kodland_enabled, timeZone: settings.time_zone, groups: groups.items, lessons: lessons.items, extras: extras.items };
      }, credentials: restoreKodlandCredentials,
      execute: (credentials, request, context) => kodlandApi.syncScope(credentials.username.trim(), credentials.password, request, context),
    });
    runtimes.set(uid, runtime);
  }
  return runtime;
}
export function runActivitiesSync(uid: string, options: { manual?: boolean } = {}) { return getAutoSyncRuntime(uid).syncActivities(options); }
export function clearAutoSyncRuntimes(): void { runtimes.forEach(runtime => runtime.dispose()); runtimes.clear(); }
export function subscribeAutoSyncSources(uid: string): () => void { return subscribeSyncDataChanged(uid, event => {
  const sourceChanged = event.domains.some(domain => ["agenda", "recordings", "call_link"].includes(domain));
  if (sourceChanged || event.domains.some(domain => ["attendance", "activities", "ranking"].includes(domain))) getAutoSyncRuntime(uid).invalidateRevision(event.scope, event.resourceId, sourceChanged);
}); }

/** Preference updates are delivered locally and across browser tabs, never by polling. */
export function subscribeAutoSyncPreferences(uid: string, runtime: Pick<AutoSyncRuntime, "setIntegrationEnabled"> = getAutoSyncRuntime(uid)): () => void {
  return subscribeTutorPreferencesChanged(uid, change => runtime.setIntegrationEnabled(change.kodland_enabled));
}
