import { expect, it, vi } from "vitest";
import { readWithDeadline } from "./read-deadline";
it("finishes unavailable reads and ignores late results without leaking timers", async () => {
  vi.useFakeTimers();
  try {
    let complete!: (value: string) => void;
    const pending = readWithDeadline(() => new Promise<string>(resolve => { complete = resolve; }), "Turmas", 100);
    const failure = expect(pending).rejects.toThrow("Turmas: o serviço não respondeu no prazo");
    await vi.advanceTimersByTimeAsync(100); await failure;
    complete("late"); await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
    expect(await readWithDeadline(async () => "recovered", "Turmas")).toBe("recovered");
    expect(vi.getTimerCount()).toBe(0);
    await expect(readWithDeadline(async () => { throw Error("offline"); }, "Turmas")).rejects.toThrow("offline");
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
