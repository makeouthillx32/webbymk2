import { describe, expect, test } from "bun:test";
import { guestDisplayName, guestSlugFromName, isGuestSlug, labDisplayName, matchesLabFilter, nextGuestSlug, queueOf } from "./labelLabDb";

describe("Label Lab", () => {
  test("guest buckets are numbered, and a new visitor fills the first free one", () => {
    expect(isGuestSlug("guest-1")).toBe(true);
    expect(isGuestSlug("guest-0")).toBe(false);
    expect(isGuestSlug("guest")).toBe(false);
    expect(isGuestSlug("tyler")).toBe(false);
    expect(guestDisplayName("guest-3")).toBe("Guest 3");
    expect(nextGuestSlug([])).toBe("guest-1");
    expect(nextGuestSlug(["guest-1", "guest-3"])).toBe("guest-2");
    expect(nextGuestSlug(["guest-1", "guest-2", "tyler"])).toBe("guest-3");
  });

  test("a guest can be named, not just numbered", () => {
    expect(guestSlugFromName("Andy")).toBe("guest-andy");
    expect(guestSlugFromName("  Mary Jane ")).toBe("guest-mary-jane");
    expect(guestSlugFromName("!!!")).toBeNull();
    expect(guestSlugFromName("")).toBeNull();
    expect(isGuestSlug("guest-andy")).toBe(true);
    expect(guestDisplayName("guest-andy")).toBe("Andy");
    expect(guestDisplayName("guest-mary-jane")).toBe("Mary Jane");
    // A numbered bucket still reads as one, and still counts when finding the next.
    expect(guestDisplayName("guest-2")).toBe("Guest 2");
    expect(nextGuestSlug(["guest-1", "guest-andy"])).toBe("guest-2");
  });

  test("one filter decides both what is shown and what a bulk action touches", () => {
    const tyler = { cluster_key: "live-person-1", detected_class: "person", assigned_target_slug: "tyler", suggested_target_slug: null };
    const andy = { cluster_key: "live-person-2", detected_class: "person", assigned_target_slug: "guest-andy", suggested_target_slug: null };
    const archive = { cluster_key: "person-abc", detected_class: "person", assigned_target_slug: "tyler", suggested_target_slug: null };
    const molly = { cluster_key: "live-dog-1", detected_class: "dog", assigned_target_slug: null, suggested_target_slug: "molly" };

    expect(matchesLabFilter(tyler, "named", { queue: "named", who: "tyler" })).toBe(true);
    expect(matchesLabFilter(andy, "named", { queue: "named", who: "tyler" })).toBe(false);
    expect(matchesLabFilter(tyler, "named", { queue: "unsure" })).toBe(false);
    expect(matchesLabFilter(andy, "named", { kind: "guest" })).toBe(true);
    expect(matchesLabFilter(tyler, "named", { kind: "guest" })).toBe(false);
    expect(matchesLabFilter(archive, "named", { scope: "live" })).toBe(false);
    expect(matchesLabFilter(archive, "named", { scope: "archive" })).toBe(true);
    // A guess counts as who a group is, until someone names it.
    expect(matchesLabFilter(molly, "confident", { who: "molly", cls: "dog" })).toBe(true);
    expect(matchesLabFilter(molly, "confident", { cls: "person" })).toBe(false);
  });

  test("names a group by its slug, whoever it belongs to", () => {
    expect(labDisplayName("tyler", "x")).toBe("TYLER");
    expect(labDisplayName("guest-2", "x")).toBe("Guest 2");
    expect(labDisplayName(null, "Unknown person")).toBe("Unknown person");
  });

  test("sorts a group into the queue that matches what is still owed on it", () => {
    const sure = [{ learner: { guess: "molly", sure: true } }];
    const unsure = [{ learner: { guess: "molly", sure: false } }];
    const base = { status: "pending", assigned_target_slug: null, review_deferred_at: null, source_refs: sure };
    expect(queueOf(base)).toBe("confident");
    expect(queueOf({ ...base, source_refs: unsure })).toBe("unsure");
    // A skip outranks the guess: the operator has already said "not now".
    expect(queueOf({ ...base, review_deferred_at: "2026-09-17T00:00:00Z" })).toBe("skipped");
    expect(queueOf({ ...base, status: "confirmed", assigned_target_slug: "molly" })).toBe("named");
    expect(queueOf({ ...base, status: "rejected" })).toBe("rejected");
    // Confirmed without a name is not a naming: it still needs grading.
    expect(queueOf({ ...base, status: "confirmed" })).toBe("confident");
  });
});
