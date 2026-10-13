import { describe, expect, it } from "vitest";
import {
  brazilianNationalHolidays,
  resolveFinancialStatus,
  saoPauloDate,
  userHolidayCollectionPath,
} from "./holidays";

describe("Brazilian holiday calendar", () => {
  it("includes fixed national holidays and Good Friday", () => {
    const holidays = brazilianNationalHolidays(2026);
    expect(holidays).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-01-01", name: "Confraternização Universal" }),
      expect.objectContaining({ date: "2026-11-20", name: "Dia Nacional de Zumbi e da Consciência Negra" }),
      expect.objectContaining({ date: "2026-04-03", name: "Paixão de Cristo" }),
    ]));
  });

  it("uses the São Paulo calendar day instead of UTC", () => {
    expect(saoPauloDate("2026-01-01T01:30:00.000Z")).toBe("2025-12-31");
    expect(saoPauloDate("2026-01-01")).toBe("2026-01-01");
  });

  it("keeps holidays in the authenticated user's collection", () => {
    expect(userHolidayCollectionPath("teacher-a")).toBe("users/teacher-a/holidays");
    expect(userHolidayCollectionPath("teacher-b")).toBe("users/teacher-b/holidays");
  });
});

describe("financial holiday resolution", () => {
  it("honors BILLABLE before the automatic holiday", () => {
    expect(resolveFinancialStatus({
      lessonDate: "2026-04-03",
      financialStatus: "BILLABLE",
    })).toMatchObject({ financialStatus: "BILLABLE", isBillable: true, holiday: null });
  });

  it("does not recalculate an already received competency", () => {
    expect(resolveFinancialStatus({
      lessonDate: "2026-04-03",
      paymentReceived: true,
    })).toEqual({ financialStatus: "", isBillable: true, holiday: null });
  });

  it("applies a custom holiday only to its exact date", () => {
    expect(resolveFinancialStatus({
      lessonDate: "2026-10-28",
      customHolidays: [{ date: "2026-10-28", name: "Feriado municipal" }],
    })).toMatchObject({ financialStatus: "HOLIDAY", isBillable: false });
  });
});
