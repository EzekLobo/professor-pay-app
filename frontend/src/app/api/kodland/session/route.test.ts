import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const request = () => new NextRequest("https://example.test/api/kodland/session", {
  method: "POST", headers: { authorization: "Bearer firebase-token", "content-type": "application/json" },
  body: JSON.stringify({ username: "teacher", password: "private-password" }),
});

describe("Kodland activity session", () => {
  it("requires a valid NexusClass session before sending credentials to Kodland", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({}, { status: 401 }));
    expect((await POST(request())).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("returns the official session without caching and sends the password only in the SSO POST body", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "user-1" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: "access", refresh_token: "refresh" }));
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ access_token: "access", refresh_token: "refresh" });
    expect(fetchMock.mock.calls[1][0]).toBe("https://sso.production.kodland.org/login");
    expect(String(fetchMock.mock.calls[1][1]?.body)).toContain("password=private-password");
  });
  it("does not leak upstream bodies when stored credentials are rejected", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "user-1" }] }))
      .mockResolvedValueOnce(Response.json({ password: "private-password" }, { status: 403 }));
    const result = await POST(request());
    expect(result.status).toBe(403);
    expect(await result.text()).not.toContain("private-password");
  });
});
