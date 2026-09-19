import { describe, expect, test } from "bun:test";

type ViewMode = "director" | "grid" | "room";
type ChatScope = "global" | "room" | "click";

interface RoomStub {
  id: string;
  roomKey: string;
  title: string;
}

function resolveActiveChatRoomId(
  explicitChatTarget: string | null,
  mode: ViewMode,
  activeRoom: RoomStub | null,
): string {
  if (explicitChatTarget === "global" || explicitChatTarget === "director") {
    return "global";
  }
  if (explicitChatTarget) {
    return explicitChatTarget;
  }
  if (mode === "director" || mode === "grid") {
    return "global";
  }
  const roomKey = activeRoom?.roomKey ?? activeRoom?.id;
  if (!roomKey || roomKey === "director" || roomKey === "global") {
    return "global";
  }
  return roomKey;
}

function resolveActiveChatScope(activeChatRoomId: string): ChatScope {
  if (activeChatRoomId === "global") return "global";
  if (activeChatRoomId.startsWith("click:")) return "click";
  return "room";
}

function parseSavedChatTarget(stored: string | null): string | null {
  if (stored && stored !== "director" && stored !== "grid" && stored !== "room") {
    return stored;
  }
  return null;
}

function computeNextChatTargetOnRoomNavigation(
  currentExplicitTarget: string | null,
): string | null {
  // If explicitly locked to global or a click clan, preserve it; otherwise auto-follow the new room
  if (
    currentExplicitTarget === "global" ||
    currentExplicitTarget?.startsWith("click:")
  ) {
    return currentExplicitTarget;
  }
  return null;
}

function computeNextChatTargetOnViewModeChange(
  nextMode: ViewMode,
  currentExplicitTarget: string | null,
): string | null {
  if (nextMode === "director" || nextMode === "grid") {
    // Preserve clan chat, otherwise reset to auto-follow (global)
    return currentExplicitTarget?.startsWith("click:") ? currentExplicitTarget : null;
  }
  return currentExplicitTarget;
}

describe("Chat Routing & Auto-Follow Architecture", () => {
  describe("Default auto-follow behavior (explicitChatTarget is null)", () => {
    test("Director mode routes to global chat", () => {
      const roomId = resolveActiveChatRoomId(null, "director", {
        id: "director",
        roomKey: "director",
        title: "Director",
      });
      expect(roomId).toBe("global");
      expect(resolveActiveChatScope(roomId)).toBe("global");
    });

    test("Grid mode routes to global chat", () => {
      const roomId = resolveActiveChatRoomId(null, "grid", null);
      expect(roomId).toBe("global");
      expect(resolveActiveChatScope(roomId)).toBe("global");
    });

    test("Room mode automatically tracks the active room", () => {
      const livingRoom: RoomStub = {
        id: "living-room",
        roomKey: "living-room",
        title: "Living Room",
      };
      const roomId = resolveActiveChatRoomId(null, "room", livingRoom);
      expect(roomId).toBe("living-room");
      expect(resolveActiveChatScope(roomId)).toBe("room");
    });

    test("Room mode automatically tracks another room when moving to it", () => {
      const kitchen: RoomStub = {
        id: "kitchen",
        roomKey: "kitchen",
        title: "Kitchen",
      };
      const roomId = resolveActiveChatRoomId(null, "room", kitchen);
      expect(roomId).toBe("kitchen");
      expect(resolveActiveChatScope(roomId)).toBe("room");
    });
  });

  describe("Explicit chat scope overrides", () => {
    test("Explicit 'global' stays on global chat even when viewing Living Room", () => {
      const livingRoom: RoomStub = {
        id: "living-room",
        roomKey: "living-room",
        title: "Living Room",
      };
      const roomId = resolveActiveChatRoomId("global", "room", livingRoom);
      expect(roomId).toBe("global");
      expect(resolveActiveChatScope(roomId)).toBe("global");
    });

    test("Explicit room chat lets user chat in Game Room while watching Director feed", () => {
      const director: RoomStub = {
        id: "director",
        roomKey: "director",
        title: "Director",
      };
      const roomId = resolveActiveChatRoomId("game-room", "director", director);
      expect(roomId).toBe("game-room");
      expect(resolveActiveChatScope(roomId)).toBe("room");
    });

    test("Explicit Click clan chat routes to clan room across any viewing mode", () => {
      const clanRoom = "click:11111111-2222-3333-4444-555555555555";
      const livingRoom: RoomStub = {
        id: "living-room",
        roomKey: "living-room",
        title: "Living Room",
      };
      const roomId = resolveActiveChatRoomId(clanRoom, "room", livingRoom);
      expect(roomId).toBe(clanRoom);
      expect(resolveActiveChatScope(roomId)).toBe("click");
    });

    test("Corrupted legacy 'director' target safely resolves to global", () => {
      const roomId = resolveActiveChatRoomId("director", "room", {
        id: "kitchen",
        roomKey: "kitchen",
        title: "Kitchen",
      });
      expect(roomId).toBe("global");
      expect(resolveActiveChatScope(roomId)).toBe("global");
    });
  });

  describe("Room Navigation Transitions", () => {
    test("Navigating to a new room clears room-specific explicit target so chat follows new room", () => {
      // User was in Kitchen chat
      const next = computeNextChatTargetOnRoomNavigation("kitchen");
      expect(next).toBeNull();
    });

    test("Navigating to a new room preserves explicit global chat preference", () => {
      const next = computeNextChatTargetOnRoomNavigation("global");
      expect(next).toBe("global");
    });

    test("Navigating to a new room preserves Click clan chat", () => {
      const clanRoom = "click:11111111-2222-3333-4444-555555555555";
      const next = computeNextChatTargetOnRoomNavigation(clanRoom);
      expect(next).toBe(clanRoom);
    });

    test("Returning to Director mode clears room-specific chat so it returns to global", () => {
      const next = computeNextChatTargetOnViewModeChange("director", "living-room");
      expect(next).toBeNull();
    });

    test("Returning to Director mode preserves Click clan chat", () => {
      const clanRoom = "click:11111111-2222-3333-4444-555555555555";
      const next = computeNextChatTargetOnViewModeChange("director", clanRoom);
      expect(next).toBe(clanRoom);
    });
  });

  describe("Persisted Storage Parsing & Self-Healing", () => {
    test("Null or empty stored value returns null to allow room auto-follow", () => {
      expect(parseSavedChatTarget(null)).toBeNull();
      expect(parseSavedChatTarget("")).toBeNull();
    });

    test("Purges corrupted mode strings written by legacy parameter mismatch", () => {
      expect(parseSavedChatTarget("director")).toBeNull();
      expect(parseSavedChatTarget("grid")).toBeNull();
      expect(parseSavedChatTarget("room")).toBeNull();
    });

    test("Preserves valid explicit room targets", () => {
      expect(parseSavedChatTarget("living-room")).toBe("living-room");
      expect(parseSavedChatTarget("kitchen")).toBe("kitchen");
      expect(parseSavedChatTarget("global")).toBe("global");
      expect(
        parseSavedChatTarget("click:11111111-2222-3333-4444-555555555555"),
      ).toBe("click:11111111-2222-3333-4444-555555555555");
    });
  });
});
