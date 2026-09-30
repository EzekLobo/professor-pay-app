import { describe, expect, it } from "vitest";
import { __test } from "./api";

describe("Firestore financial helpers", () => {
  it("calcula o período da quinzena", () => expect(__test.period("2026-09-14")).toBe("01 a 15/09/2026"));
  it("calcula o pagamento no primeiro ou décimo quinto dia seguinte", () => {
    expect(__test.paymentDate("2026-09-14")).toBe("2026-10-01");
    expect(__test.paymentDate("2026-09-20")).toBe("2026-10-15");
  });
});
