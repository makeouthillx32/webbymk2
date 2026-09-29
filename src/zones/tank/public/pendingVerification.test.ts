import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearPendingVerification,
  PENDING_VERIFICATION_TTL_MS,
  readPendingVerification,
  rememberPendingVerification,
} from "./pendingVerification";

// This decides whether someone who signed up and refreshed ever sees a way back
// in. Every failure mode here is a person permanently stuck: either no hint at
// all, or a stale hint dragging them into a screen they already finished with.

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  // safeStorage reads window.localStorage; stand in for it.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { window?: unknown }).window = globalThis;
});

describe("remembering an unfinished signup", () => {
  test("round-trips the address", () => {
    rememberPendingVerification("Person@Example.com");
    expect(readPendingVerification()?.email).toBe("person@example.com");
  });

  test("nothing pending reads as null, not a throw", () => {
    expect(readPendingVerification()).toBeNull();
  });

  test("clearing removes it", () => {
    rememberPendingVerification("a@b.co");
    clearPendingVerification();
    expect(readPendingVerification()).toBeNull();
  });

  test("an empty address is not remembered", () => {
    rememberPendingVerification("   ");
    expect(readPendingVerification()).toBeNull();
  });
});

describe("not haunting the browser", () => {
  test("an entry past its TTL is dropped", () => {
    rememberPendingVerification("old@example.com");
    const later = Date.now() + PENDING_VERIFICATION_TTL_MS + 1;
    expect(readPendingVerification(later)).toBeNull();
  });

  test("an expired entry is ERASED, not just hidden", () => {
    // Otherwise it comes back the moment a later read uses a different clock.
    rememberPendingVerification("old@example.com");
    readPendingVerification(Date.now() + PENDING_VERIFICATION_TTL_MS + 1);
    expect(readPendingVerification()).toBeNull();
  });

  test("an entry just inside the TTL survives", () => {
    rememberPendingVerification("fresh@example.com");
    const nearly = Date.now() + PENDING_VERIFICATION_TTL_MS - 1000;
    expect(readPendingVerification(nearly)?.email).toBe("fresh@example.com");
  });
});

describe("surviving junk in storage", () => {
  test("unparseable content is cleared rather than thrown on", () => {
    store.set("tank_pending_verification", "{not json");
    expect(readPendingVerification()).toBeNull();
    expect(store.has("tank_pending_verification")).toBe(false);
  });

  test("a well-formed object missing fields is rejected", () => {
    store.set("tank_pending_verification", JSON.stringify({ at: Date.now() }));
    expect(readPendingVerification()).toBeNull();
  });

  test("a non-numeric timestamp is rejected", () => {
    store.set(
      "tank_pending_verification",
      JSON.stringify({ email: "x@y.co", at: "yesterday" }),
    );
    expect(readPendingVerification()).toBeNull();
  });
});
