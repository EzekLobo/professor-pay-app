import { describe, expect, it } from "vitest";
import {
  KodlandSyncPersistenceError,
  KodlandSyncResponseError,
  kodlandSyncNetworkError,
  readKodlandSyncResponse,
} from "./kodland-sync-response";

const requestId = "d271ac9f-94e1-4907-a977-a82f68ee8c12";
const serverId = "7f6fa104-a38c-45c0-8de1-19af9719c818";

describe("Kodland sync response", () => {
  it("preserves HTTP status, content type and request reference for a Vercel HTML timeout", async () => {
    const response = new Response("<html>Gateway Timeout</html>", {
      status: 504,
      headers: { "content-type": "text/html" },
    });
    await expect(readKodlandSyncResponse(response, requestId)).rejects.toMatchObject({
      status: 504,
      contentType: "text/html",
      syncId: requestId,
      message: expect.stringContaining("demorou além do limite"),
    });
  });

  it("reports a distinct message and the server reference for rejected credentials", async () => {
    const response = Response.json(
      { code: "kodland_invalid_credentials", message: "sensitive upstream message" },
      { status: 403, headers: { "x-sync-id": serverId } },
    );
    try {
      await readKodlandSyncResponse(response, requestId);
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(KodlandSyncResponseError);
      expect(error).toMatchObject({ status: 403, syncId: serverId });
      expect((error as Error).message).toContain("Usuário ou senha");
      expect((error as Error).message).not.toContain("sensitive upstream message");
    }
  });

  it("distinguishes rate limit and temporary server errors", async () => {
    const rateLimited = Response.json({ code: "kodland_rate_limited" }, { status: 429 });
    const unavailable = Response.json({ code: "unexpected_sync_failure" }, { status: 502 });
    await expect(readKodlandSyncResponse(rateLimited, requestId)).rejects.toThrow("limitou temporariamente");
    await expect(readKodlandSyncResponse(unavailable, requestId)).rejects.toThrow("temporariamente indisponível");
  });

  it("distinguishes an invalid JSON body from a network error", async () => {
    const invalid = new Response("{broken", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    await expect(readKodlandSyncResponse(invalid, requestId)).rejects.toThrow("resposta inválida");
    expect(kodlandSyncNetworkError(requestId)).toMatchObject({
      status: 0,
      contentType: "não disponível",
      syncId: requestId,
      message: expect.stringContaining("conectar ao servidor"),
    });
  });

  it("rejects incomplete success payloads before Firestore writes", async () => {
    const response = Response.json({ groups: [] });
    await expect(readKodlandSyncResponse(response, requestId)).rejects.toThrow("dados incompletos");
  });

  it("accepts a complete snapshot", async () => {
    const snapshot = {
      groups: [], students: [], reviews: [], lessons: [], extra_lessons: [], availability: [],
    };
    await expect(readKodlandSyncResponse(Response.json(snapshot), requestId)).resolves.toEqual(snapshot);
  });

  it("identifies a failed Firestore save after a successful Kodland response", () => {
    const error = new KodlandSyncPersistenceError(requestId, "gravação");
    expect(error.message).toContain("A Kodland respondeu");
    expect(error.message).toContain(requestId);
  });
});
