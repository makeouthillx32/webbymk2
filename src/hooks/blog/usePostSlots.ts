"use client";
// hooks/blog/usePostSlots.ts
// Owns a post's image slots (posts/<slug>/cover, image-1, image-2, …).
//
// Three rules learned from real authoring sessions (2026-07-27, iOS test):
//
// 1. RESERVING is separate from UPLOADING. The editor drops `post://image-3`
//    into the text the instant a file is pasted and lets the upload finish in
//    the background — the reference resolves at render time either way.
//
// 2. A slot name is NEVER re-issued within an editor session — even when its
//    upload failed. The failure path used to release the name, so pasting a
//    second image after a failed first paste produced `image-1` twice: two
//    different pictures, one name, and the markdown refs silently collided.
//    The counter only moves forward; a failed slot can be retried from the
//    slots panel, which targets the SAME name deliberately.
//
// 3. Uploads are provisional until the post is SAVED. Storage writes happen at
//    paste time (they must — the preview needs the file), but slots that did
//    not exist before this session are tracked, and:
//      • save   → commitSession() keeps them;
//      • cancel → discardSession() deletes them from storage.
//    Replacements of pre-existing slots are exempt — the old file is already
//    overwritten, deleting the new one would just lose both.
//
// 4. A session entry is recorded BEFORE the upload's network round-trip, not
//    after (2026-07-29: paste-then-immediately-Cancel raced the old code —
//    discardSession ran while sessionRef was still empty, found nothing to
//    delete, and the file was orphaned in storage while the text reference
//    vanished with the discarded draft). discardSession now also awaits any
//    upload still in flight for a slot it's about to delete, so a fast
//    cancel can never run ahead of the write it's supposed to undo.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { COVER_SLOT } from "@/lib/blog/constants";
import {
  listPostSlots,
  nextImageSlot,
  removePostSlot,
  sortedImageSlots,
  stripCacheBuster,
  uploadPostSlot,
  type SlotMap,
} from "@/lib/blog/images";

/** A provisional upload: where it landed, so discard can find it later. */
interface SessionUpload {
  slug: string;
  slot: string;
}

function friendlyUploadError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Upload failed";
  if (/row-level security/i.test(message)) {
    return "Upload rejected — your sign-in session has expired. Sign out, sign back in, and paste again.";
  }
  return message;
}

export interface UsePostSlotsResult {
  slots: SlotMap;
  /** Slot names with an upload in flight. */
  busy: string[];
  isBusy: (slot: string) => boolean;
  /** Numbered slots that currently hold a file, in order. */
  imageSlots: string[];
  /** The next empty slot name shown as the "add" tile. */
  nextSlot: string;
  /** Claim a slot name now (monotonic — never re-issued this session). */
  reserveSlot: () => string;
  upload: (slot: string, file: File) => Promise<string | null>;
  remove: (slot: string) => Promise<void>;
  refresh: () => Promise<void>;
  /** Keep this session's uploads (call after a successful save). */
  commitSession: () => void;
  /** Delete this session's uncommitted uploads (call on cancel). Returns count. */
  discardSession: () => Promise<number>;
}

export function usePostSlots({
  slug,
  onCoverChange,
}: {
  slug: string;
  onCoverChange?: (url: string | null) => void;
}): UsePostSlotsResult {
  const [slots, setSlots] = useState<SlotMap>({});
  const [busy, setBusy] = useState<string[]>([]);

  // Every slot name handed out this session — grows, never shrinks (rule 2).
  const issuedRef = useRef<Set<string>>(new Set());
  // Uploads that created a NEW slot this session — provisional until commit (rule 3).
  const sessionRef = useRef<SessionUpload[]>([]);
  // Slot → in-flight upload promise, so discardSession can wait one out (rule 4).
  const inFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());

  const slotsRef = useRef<SlotMap>({});
  slotsRef.current = slots;
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const refresh = useCallback(async () => {
    if (!slugRef.current) {
      setSlots({});
      return;
    }
    setSlots(await listPostSlots(slugRef.current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Slug changed (title being typed on a new post): reload what exists there.
    // issuedRef is NOT cleared — names stay unique for the whole session.
    if (!slug) {
      setSlots({});
      return () => {
        cancelled = true;
      };
    }
    listPostSlots(slug).then((map) => {
      if (!cancelled) setSlots(map);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const reserveSlot = useCallback(() => {
    const taken = [...Object.keys(slotsRef.current), ...issuedRef.current];
    const slot = nextImageSlot(taken);
    issuedRef.current.add(slot);
    return slot;
  }, []);

  const upload = useCallback(
    (slot: string, file: File) => {
      if (!slugRef.current) {
        toast.error("Give the post a title first — images are filed under its slug");
        return Promise.resolve(null);
      }
      const slug = slugRef.current;
      issuedRef.current.add(slot); // direct panel uploads count too
      const isNewSlot = !(slot in slotsRef.current);

      // Recorded NOW, before the network round-trip — a Cancel that lands
      // mid-upload must still find this slot to clean up (rule 4).
      if (isNewSlot && !sessionRef.current.some((entry) => entry.slug === slug && entry.slot === slot)) {
        sessionRef.current.push({ slug, slot });
      }

      setBusy((current) => [...current, slot]);
      const run = async () => {
        try {
          const uploaded = await uploadPostSlot({ slug, slot, file });
          setSlots((current) => ({ ...current, [slot]: uploaded.freshUrl }));
          if (slot === COVER_SLOT) onCoverChange?.(stripCacheBuster(uploaded.publicUrl));
          return uploaded.freshUrl;
        } catch (cause) {
          // The name stays issued (rule 2) — retry from the panel reuses it.
          toast.error(friendlyUploadError(cause));
          return null;
        } finally {
          setBusy((current) => current.filter((name) => name !== slot));
        }
      };

      const promise = run().finally(() => {
        // Only clear the map entry if it's still ours — a fresh upload of
        // the same slot may already have replaced it.
        if (inFlightRef.current.get(slot) === promise) inFlightRef.current.delete(slot);
      });
      inFlightRef.current.set(slot, promise);
      return promise;
    },
    [onCoverChange],
  );

  const remove = useCallback(
    async (slot: string) => {
      if (!slugRef.current) return;
      try {
        await removePostSlot({ slug: slugRef.current, slot });
        sessionRef.current = sessionRef.current.filter(
          (entry) => !(entry.slug === slugRef.current && entry.slot === slot),
        );
        setSlots((current) => {
          const next = { ...current };
          delete next[slot];
          return next;
        });
        if (slot === COVER_SLOT) onCoverChange?.(null);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not remove that image");
      }
    },
    [onCoverChange],
  );

  const commitSession = useCallback(() => {
    sessionRef.current = [];
  }, []);

  const discardSession = useCallback(async () => {
    const pending = sessionRef.current;
    sessionRef.current = [];
    let removed = 0;
    for (const entry of pending) {
      // Let a still-uploading paste land before deleting it — otherwise the
      // DELETE can race the PUT and the file survives the cancel (rule 4).
      await inFlightRef.current.get(entry.slot)?.catch(() => null);
      try {
        await removePostSlot({ slug: entry.slug, slot: entry.slot });
        removed += 1;
      } catch {
        // Best effort — an orphaned file is recoverable, a blocked cancel is not.
      }
    }
    if (removed > 0) {
      setSlots((current) => {
        const next = { ...current };
        for (const entry of pending) {
          if (entry.slug === slugRef.current) delete next[entry.slot];
        }
        return next;
      });
    }
    return removed;
  }, []);

  const imageSlots = sortedImageSlots(slots);
  const nextSlot = nextImageSlot([...Object.keys(slots), ...issuedRef.current]);

  return {
    slots,
    busy,
    isBusy: (slot: string) => busy.includes(slot),
    imageSlots,
    nextSlot,
    reserveSlot,
    upload,
    remove,
    refresh,
    commitSession,
    discardSession,
  };
}
