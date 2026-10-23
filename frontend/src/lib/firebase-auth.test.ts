import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  token: vi.fn(), signOut: vi.fn(), authChanged: vi.fn(), unsubscribe: vi.fn(),
}));
const auth = { currentUser: { uid: "teacher", email: "teacher@example.test", displayName: "Ana", getIdToken: mocks.token } };
vi.mock("@/lib/firebase", () => ({ getFirebaseAuth: () => auth }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.authChanged, signOut: mocks.signOut,
  sendPasswordResetEmail: vi.fn(), signInWithEmailAndPassword: vi.fn(),
}));
import { subscribeToAuth } from "./firebase-auth";
const win = new EventTarget();
const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("window", Object.assign(win, { setInterval, clearInterval }));
  vi.stubGlobal("document", doc);
  doc.visibilityState = "visible";
  mocks.authChanged.mockImplementation((_auth, callback) => { callback(auth.currentUser); return mocks.unsubscribe; });
  mocks.token.mockResolvedValue("fresh-token");
  mocks.signOut.mockResolvedValue(undefined);
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("verificação de acesso nas sessões abertas", () => {
  it("encerra uma sessão cujo acesso foi bloqueado", async () => {
    mocks.token.mockRejectedValue({ code: "auth/user-disabled" });
    cleanup = subscribeToAuth(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.token).toHaveBeenCalledWith(true);
    expect(mocks.signOut).toHaveBeenCalledWith(auth);
  });
  it("verifica novamente no intervalo e ao retornar à janela", async () => {
    cleanup = subscribeToAuth(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.token).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.token).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.token).toHaveBeenCalledTimes(3);
  });
  it("preserva a sessão quando há uma falha de conexão", async () => {
    mocks.token.mockRejectedValue({ code: "auth/network-request-failed" });
    cleanup = subscribeToAuth(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("pausa a verificação em segundo plano e remove os listeners ao sair", async () => {
    doc.visibilityState = "hidden";
    cleanup = subscribeToAuth(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.token).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.token).toHaveBeenCalledTimes(1);
    cleanup(); cleanup = undefined;
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.token).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
