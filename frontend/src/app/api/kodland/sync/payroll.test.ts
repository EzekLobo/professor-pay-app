import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const token = `header.${Buffer.from(JSON.stringify({ user_id: 22 })).toString("base64url")}.signature`;
const request = (periodId?: string) => new NextRequest("https://example.test/api/kodland/sync", {
  method: "POST", headers: { authorization: "Bearer firebase-token", "content-type": "application/json" },
  body: JSON.stringify({ username: "tutor", password: "secret", mode: "payroll", payroll_period_id: periodId }),
});

describe("read-only payroll endpoint", () => {
  it("preserves a real permission denial from the periods endpoint", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "nexus-user" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: token }))
      .mockResolvedValueOnce(Response.json({ detail: "Forbidden" }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "payroll_not_authorized" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("derives teacher from authenticated SSO and rejects a period outside the authorized list", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "nexus-user" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: token }))
      .mockResolvedValueOnce(Response.json([{ id: 12, teacher: 22 }]));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request("someone-elses-period"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "payroll_not_authorized" });
    expect(String(fetch.mock.calls[2][0])).toContain("teacher_id=22");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("consults authorized tutor periods without using roster rollout flags as permission", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "nexus-user" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: token }))
      .mockResolvedValueOnce(Response.json([{ id: 12, teacher: 22 }]));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ payroll_teacher_id: "22", payroll_period_ids: ["12"] });
    expect(String(fetch.mock.calls[2][0])).toContain("tutor_payroll_periods/?teacher_id=22");
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
