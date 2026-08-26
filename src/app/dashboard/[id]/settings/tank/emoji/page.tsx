"use client";

import { TankImageBucketManager } from "../_components/TankImageBucketManager";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";

export default function TankEmojiPage() {
  return (
    <TankImageBucketManager
      bucket={STORAGE_BUCKETS.tankEmoji}
      folder="emotes"
      title="Tank Emoji"
      description="Custom emotes for Tank's live chat. The filename (without extension) becomes the :shortcode: viewers type in chat — no database row, the bucket listing is the source of truth. PNG, GIF, or WebP, up to 512 KB."
    />
  );
}
