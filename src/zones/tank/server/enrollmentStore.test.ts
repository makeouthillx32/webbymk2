import { describe, expect, test } from "bun:test";
import { enrollableMember, enrollmentSlug } from "./enrollmentStore";
import { followableWithGuests, followDisplayName, isFollowableSlug, memberPresence } from "./followMember";

describe("Enroll Guest", () => {
  test("a guest's name becomes the slug the learner labels them with", () => {
    expect(enrollmentSlug("Andy")).toBe("guest-andy");
    expect(enrollmentSlug("  Mary Jane ")).toBe("guest-mary-jane");
    expect(enrollmentSlug("!!!")).toBeNull();
  });

  test("an enrolled guest can be followed like a housemate", () => {
    expect(isFollowableSlug("guest-andy")).toBe(true);
    expect(isFollowableSlug("tyler")).toBe(true);
    expect(isFollowableSlug("not-server-rack")).toBe(false);
    expect(isFollowableSlug("guest-")).toBe(false);
    expect(followDisplayName("guest-andy")).toBe("Andy");
    expect(followDisplayName("guest-2")).toBe("Guest 2");
  });

  test("the picker lists housemates and pets, then every confirmed guest", () => {
    const list = followableWithGuests(["guest-andy", "guest-jacob", "not-server-rack"]);
    expect(list.some((m) => m.slug === "tyler")).toBe(true);
    expect(list.filter((m) => "guest" in m && m.guest).map((m) => m.slug)).toEqual(["guest-andy", "guest-jacob"]);
  });

  test("the director finds the guest by the slug the learner publishes", () => {
    const reading = {
      cameraId: "cam-1", peopleCount: 1, visibleFeetCount: 0, feetConfidence: 0, faceCount: 0, motionScore: 0, audioPeak: 0,
      isSpeaking: false, boundingBoxes: [{ nx: 0.4, ny: 0.3, nw: 0.1, nh: 0.4, label: "person", targetName: "guest-andy", confidence: 0.8 }],
    };
    expect(memberPresence(reading, "guest-andy").present).toBe(true);
    expect(memberPresence(reading, "tyler").present).toBe(false);
  });

  test("housemates can be enrolled in new poses; pets and strangers' slugs cannot", () => {
    expect(enrollableMember("joe")).toEqual({ slug: "joe", displayName: "Joe" });
    expect(enrollableMember("tyler")?.slug).toBe("tyler");
    expect(enrollableMember("molly")).toBeNull();
    expect(enrollableMember("guest-andy")).toBeNull();
  });
});
