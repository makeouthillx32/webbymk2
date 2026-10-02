import { beforeAll, describe, expect, test } from "bun:test";

// cookieUtils runs storage.cleanup() at import when `window` exists, so the
// fake stores must be in place before the module loads.
class FakeStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const local = new FakeStorage();
const session = new FakeStorage();
let storage: { cleanup: () => void };

beforeAll(async () => {
  Object.assign(globalThis, { window: globalThis, localStorage: local, sessionStorage: session, document: { cookie: "" } });
  ({ storage } = await import("./cookieUtils"));
});

describe("storage.cleanup", () => {
  test("keeps plain-string values that other code stores (Tank chat size, room, target)", () => {
    local.setItem("tank_mobile_chat_size", "hidden");
    local.setItem("tank_desktop_chat_size", "full");
    session.setItem("tank_room_mode", "director");
    local.setItem("themeId", "dark-forest");
    storage.cleanup();
    expect(local.getItem("tank_mobile_chat_size")).toBe("hidden");
    expect(local.getItem("tank_desktop_chat_size")).toBe("full");
    expect(session.getItem("tank_room_mode")).toBe("director");
    expect(local.getItem("themeId")).toBe("dark-forest");
  });

  test("still expires its own entries, and only those", () => {
    const own = (expiry: number | null) => JSON.stringify({ value: 1, expiry, timestamp: 0, version: "1.2.0" });
    local.setItem("expired", own(Date.now() - 1000));
    local.setItem("fresh", own(Date.now() + 60_000));
    local.setItem("forever", own(null));
    local.setItem("someone-elses-json", JSON.stringify({ expiry: 1 }));
    storage.cleanup();
    expect(local.getItem("expired")).toBeNull();
    expect(local.getItem("fresh")).not.toBeNull();
    expect(local.getItem("forever")).not.toBeNull();
    expect(local.getItem("someone-elses-json")).not.toBeNull();
  });
});
