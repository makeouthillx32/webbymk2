import { describe, expect, test } from "bun:test";
import {
  clearAuthNavigationIntent,
  hasFreshAuthNavigationIntent,
  markAuthNavigationIntent,
} from "./authNavigationIntent";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("auth navigation intent", () => {
  test("belongs only to the tab-local storage that initiated sign-in", () => {
    const adminTab = memoryStorage();
    const viewerTab = memoryStorage();

    markAuthNavigationIntent(1_000, adminTab);

    expect(hasFreshAuthNavigationIntent(2_000, adminTab)).toBe(true);
    expect(hasFreshAuthNavigationIntent(2_000, viewerTab)).toBe(false);
  });

  test("expires stale intent instead of redirecting a later auth event", () => {
    const tab = memoryStorage();
    markAuthNavigationIntent(1_000, tab);

    expect(hasFreshAuthNavigationIntent(601_001, tab)).toBe(false);
    expect(hasFreshAuthNavigationIntent(2_000, tab)).toBe(false);
  });

  test("can be cleared after a failed or completed sign-in", () => {
    const tab = memoryStorage();
    markAuthNavigationIntent(1_000, tab);
    clearAuthNavigationIntent(tab);

    expect(hasFreshAuthNavigationIntent(2_000, tab)).toBe(false);
  });
});
