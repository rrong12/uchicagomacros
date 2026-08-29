import { describe, it, expect } from "vitest";
import { chicagoDate } from "../src/domain/datetime";

describe("chicagoDate", () => {
  it("formats as YYYY-MM-DD", () => {
    const d = chicagoDate(new Date("2026-08-29T17:00:00Z"));
    expect(d).toBe("2026-08-29");
  });

  it("uses Chicago time, not UTC", () => {
    // 02:00 UTC on the 30th is 21:00 on the 29th in Chicago.
    const d = chicagoDate(new Date("2026-08-30T02:00:00Z"));
    expect(d).toBe("2026-08-29");
  });

  it("rolls over at Chicago midnight, not UTC midnight", () => {
    // 06:00 UTC on the 30th is 01:00 on the 30th in Chicago (CDT, UTC-5).
    const d = chicagoDate(new Date("2026-08-30T06:00:00Z"));
    expect(d).toBe("2026-08-30");
  });
});
