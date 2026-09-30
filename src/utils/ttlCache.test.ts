import { describe, test, expect } from "vitest";
import { TTLCache } from "./ttlCache";

// A controllable clock so tests never depend on real time.
function makeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("TTLCache", () => {
  test("returns a stored value before it expires", () => {
    const clock = makeClock();
    const cache = new TTLCache<string, number>(10, 1000, clock.now);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  test("expires an entry after its TTL", () => {
    const clock = makeClock();
    const cache = new TTLCache<string, number>(10, 1000, clock.now);
    cache.set("a", 1);
    clock.advance(1000);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  test("returns undefined for a missing key", () => {
    const cache = new TTLCache<string, number>(10, 1000);
    expect(cache.get("missing")).toBeUndefined();
  });

  test("evicts the oldest entry when at capacity", () => {
    const cache = new TTLCache<string, number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  test("re-setting an existing key refreshes its eviction order", () => {
    const cache = new TTLCache<string, number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 11); // a is now the newest, b is oldest
    cache.set("c", 3); // should evict b
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(11);
    expect(cache.get("c")).toBe(3);
  });

  test("delete removes an entry", () => {
    const cache = new TTLCache<string, number>(10, 1000);
    cache.set("a", 1);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
  });
});
