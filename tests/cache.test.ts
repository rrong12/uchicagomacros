import { describe, it, expect, beforeEach } from "vitest";
import { cacheKey, readCache, writeCache, evictStale } from "../src/api/cache";

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("builds a namespaced key", () => {
    expect(cacheKey("loc1", "2026-08-29")).toBe("menu:loc1:2026-08-29");
  });

  it("round-trips a value", () => {
    writeCache("loc1", "2026-08-29", { hello: "world" });
    expect(readCache("loc1", "2026-08-29")).toEqual({ hello: "world" });
  });

  it("returns null on a miss", () => {
    expect(readCache("nope", "2026-08-29")).toBeNull();
  });

  it("returns null rather than throwing on corrupt JSON", () => {
    localStorage.setItem("menu:loc1:2026-08-29", "{not json");
    expect(readCache("loc1", "2026-08-29")).toBeNull();
  });

  it("evicts entries for earlier dates but keeps today", () => {
    writeCache("loc1", "2026-08-28", { old: true });
    writeCache("loc1", "2026-08-29", { current: true });
    evictStale("2026-08-29");
    expect(readCache("loc1", "2026-08-28")).toBeNull();
    expect(readCache("loc1", "2026-08-29")).toEqual({ current: true });
  });
});
