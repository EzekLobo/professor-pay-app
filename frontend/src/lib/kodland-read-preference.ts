import { readWithDeadline } from "./read-deadline";
/** An explicit preference wins over cache presence; unavailable service may use an owned cache. */
export async function kodlandReadPreference(read: () => Promise<{ kodland_enabled: boolean }>, localActive: boolean): Promise<{ kodland_enabled: boolean }> {
  try { return await readWithDeadline(read, "Preferências Kodland", 3000); }
  catch (reason) {
    const error = reason as { code?: string; status?: number } | null;
    if (!localActive || [401, 403].includes(error?.status ?? 0) || error?.code === "unauthenticated" || error?.code === "permission-denied") throw reason;
    return { kodland_enabled: true };
  }
}
