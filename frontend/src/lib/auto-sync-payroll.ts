import { kodlandPayrollApi, tutorPreferencesApi, type DashboardPayment } from "./api";
import { restoreKodlandCredentials, type KodlandCredentials } from "./browser-credentials";
import { readKodlandLocal } from "./kodland-sync-client";
import { nextMonthPaymentDate } from "./teaching-finance";
import { getFirebaseAuth } from "./firebase";
import { getSyncCoordinator, type SyncCoordinator, type SyncExecutionContext } from "./sync-coordinator";
import { calendarDay, payrollDecision, syncTimeZone, type SyncHistory } from "./sync-policy";

type PaymentCandidate = Pick<DashboardPayment, "payment_date" | "status">;
export type PayrollEntryResult = { status: "idle" | "disabled" | "credentials_required" | "auth_required" | "updated" | "pending"; updated: number; failed: number };
export type PayrollEntryAdapter = {
  coordinator: Pick<SyncCoordinator, "enqueue">;
  credentials(): Promise<KodlandCredentials | null>;
  sync(paymentDate: string, credentials: KodlandCredentials, context: SyncExecutionContext): Promise<unknown>;
  now?: () => number;
};

/** Several payment dates can belong to the same official monthly payroll. */
export function payrollPeriodKey(paymentDate: string): string {
  const date = new Date(`${paymentDate.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
export function eligiblePayrollPayments(payments: PaymentCandidate[], now: number, timeZone: string): PaymentCandidate[] {
  const byPeriod = new Map<string, PaymentCandidate>();
  for (const item of payments) {
    if (item.status === "RECEIVED" || !payrollDecision(item.payment_date, now, {}, timeZone).due) continue;
    const period = payrollPeriodKey(item.payment_date);
    if (!byPeriod.has(period)) byPeriod.set(period, item);
  }
  return [...byPeriod.values()];
}

/** Entry refreshes share the account lease and a short freshness window between pages. */
export function payrollEntryDue(now: number, history: SyncHistory): boolean {
  return !(history.next_due_at && history.next_due_at > now) && (history.last_success_at == null || now - history.last_success_at >= 5 * 60000);
}
export function entryPayrollPayments(payments: PaymentCandidate[], now: number, timeZone: string): PaymentCandidate[] {
  const today = calendarDay(now, timeZone);
  const month = today.slice(0, 7);
  const source = payments.length ? [...payments] : [{ payment_date: `${month}-15`, status: "EXPECTED" }];
  // The current teaching month is paid next month, even without a local schedule.
  const nextPayment = nextMonthPaymentDate(today);
  if (!source.some(item => item.payment_date.slice(0, 7) === nextPayment.slice(0, 7))) source.push({ payment_date: nextPayment, status: "EXPECTED" });
  const byPeriod = new Map<string, PaymentCandidate>();
  for (const item of [...source].sort((a, b) => b.payment_date.localeCompare(a.payment_date))) {
    if (item.status === "RECEIVED" || !/^\d{4}-\d{2}-\d{2}$/.test(item.payment_date) || Number.isNaN(Date.parse(item.payment_date))) continue;
    const period = payrollPeriodKey(item.payment_date);
    if (period > month || byPeriod.has(period)) continue;
    byPeriod.set(period, item);
    if (byPeriod.size === 2) break;
  }
  return [...byPeriod.values()];
}

/** One entry action; daily success is authoritative in the coordinator's durable store. */
export class PayrollEntrySync {
  private authBlocked = false;
  private integrationEnabled = true;
  constructor(private readonly adapter: PayrollEntryAdapter) {}
  resetAuthentication(): void { this.authBlocked = false; }
  setIntegrationEnabled(enabled: boolean): void { this.integrationEnabled = enabled; }
  async run(payments: PaymentCandidate[], options: { enabled: boolean; timeZone: string; refreshOnEntry?: boolean; force?: boolean }): Promise<PayrollEntryResult> {
    const result: PayrollEntryResult = { status: "idle", updated: 0, failed: 0 };
    if (!options.enabled || !this.integrationEnabled) return { ...result, status: "disabled" };
    if (this.authBlocked) return { ...result, status: "auth_required" };
    const now = this.adapter.now ?? Date.now, timeZone = syncTimeZone(options.timeZone);
    const candidates = options.refreshOnEntry ? entryPayrollPayments(payments, now(), timeZone) : eligiblePayrollPayments(payments, now(), timeZone);
    if (!candidates.length) return result;
    const credentials = await this.adapter.credentials();
    if (!this.integrationEnabled) return { ...result, status: "disabled" };
    if (!credentials) return { ...result, status: "credentials_required" };
    for (const payment of candidates) {
      if (!this.integrationEnabled) return { ...result, status: "disabled" };
      const period = payrollPeriodKey(payment.payment_date);
      try {
        const outcome = await this.adapter.coordinator.enqueue({
          key: `payroll:${period}`, scope: "payroll", resourceId: period,
          isDue: (state, at) => this.integrationEnabled && (options.force || (options.refreshOnEntry ? payrollEntryDue(at, state) : payrollDecision(payment.payment_date, at, state, timeZone).due)),
          run: async context => {
            context.assertCurrent();
            if (!this.integrationEnabled) throw new PayrollDisabledError();
            const response = await this.adapter.sync(payment.payment_date, credentials, context);
            const changed = !(response && typeof response === "object" && "changed" in response && response.changed === false);
            context.assertCurrent();
            // Not permanently complete: another successful check becomes eligible tomorrow.
            return { value: { period, changed }, completed: false, domains: changed ? ["payments"] : [] };
          },
        });
        if (!this.integrationEnabled) return { ...result, status: "disabled" };
        if (outcome.status !== "skipped") { if (outcome.value.changed) result.updated++; }
        else if (outcome.reason === "unavailable") result.failed++;
      } catch (error) {
        if (error instanceof PayrollDisabledError || !this.integrationEnabled) return { ...result, status: "disabled" };
        result.failed++;
        const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
        if (status === 401 || status === 403) { this.authBlocked = true; return { ...result, status: "auth_required" }; }
      }
    }
    result.status = result.failed ? "pending" : result.updated ? "updated" : "idle";
    return result;
  }
}

class PayrollDisabledError extends Error { constructor() { super("Kodland integration is disabled."); this.name = "PayrollDisabledError"; } }
const runners = new Map<string, PayrollEntrySync>();
const integrationOverrides = new Map<string, boolean>();
const preferencesRevisions = new Map<string, number>();
export function setAutomaticPayrollEnabled(uid: string, enabled: boolean): void {
  if (getFirebaseAuth().currentUser?.uid !== uid) return;
  preferencesRevisions.set(uid, (preferencesRevisions.get(uid) ?? 0) + 1);
  integrationOverrides.set(uid, enabled); runners.get(uid)?.setIntegrationEnabled(enabled);
}
/** The page supplies the timezone already loaded by its notification provider. */
export async function syncPaymentsOnEntry(payments: PaymentCandidate[], options: { timeZone: string; demo?: boolean; refreshOnEntry?: boolean; force?: boolean }): Promise<PayrollEntryResult> {
  const idle: PayrollEntryResult = { status: "idle", updated: 0, failed: 0 };
  if (options.demo || !(options.refreshOnEntry ? entryPayrollPayments(payments, Date.now(), syncTimeZone(options.timeZone)) : eligiblePayrollPayments(payments, Date.now(), syncTimeZone(options.timeZone))).length) return idle;
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return idle;
  const revision = preferencesRevisions.get(uid) ?? 0;
  const preferences = await readKodlandLocal(() => tutorPreferencesApi.get(), crypto.randomUUID(), "Preferências da integração", 8000);
  if (getFirebaseAuth().currentUser?.uid !== uid) return idle;
  const enabled = revision === (preferencesRevisions.get(uid) ?? 0) ? preferences.kodland_enabled : integrationOverrides.get(uid) ?? preferences.kodland_enabled;
  runners.get(uid)?.setIntegrationEnabled(enabled);
  if (!enabled) return { ...idle, status: "disabled" };
  let runner = runners.get(uid);
  if (!runner) {
    runner = new PayrollEntrySync({
      // The account may have been disposed while another user was active. Resolve on every job.
      coordinator: { enqueue: job => getSyncCoordinator(uid).enqueue(job) }, credentials: restoreKodlandCredentials,
      sync: (paymentDate, credentials, context) => kodlandPayrollApi.syncForPaymentDate(credentials.username, credentials.password, paymentDate, context),
    });
    runners.set(uid, runner);
  }
  runner.setIntegrationEnabled(enabled);
  return runner.run(payments, { enabled: true, timeZone: options.timeZone, refreshOnEntry: options.refreshOnEntry, force: options.force });
}
export function resetAutomaticPayrollAuthentication(uid: string): void { runners.get(uid)?.resetAuthentication(); }
