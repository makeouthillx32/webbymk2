"use client";

// A room's audio OUTPUT device is deliberately not server state (see the
// migration comment on tank_rooms.audio_output_kind = 'client-broadcast').
// For that kind, "the room's speaker" is just whatever device has Tank open
// and has locally assigned itself to that room — e.g. a tablet in the
// Living Room with its OS output already Bluetooth-paired to a speaker
// there. That assignment only ever needs to live on the device itself.

import { useCallback, useEffect, useState } from "react";
import { safeStorage } from "@/lib/safeStorage";

const STORAGE_KEY = "tank:assigned-room-key";

export function useTankRoomAudioOutput() {
  const [assignedRoomKey, setAssignedRoomKeyState] = useState<string | null>(null);

  useEffect(() => {
    try {
      setAssignedRoomKeyState(safeStorage.getItem(STORAGE_KEY));
    } catch {
      // safe default
    }
  }, []);

  const setAssignedRoomKey = useCallback((roomKey: string | null) => {
    setAssignedRoomKeyState(roomKey);
    try {
      if (roomKey) safeStorage.setItem(STORAGE_KEY, roomKey);
      else safeStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort persistence only.
    }
  }, []);

  return { assignedRoomKey, setAssignedRoomKey };
}
