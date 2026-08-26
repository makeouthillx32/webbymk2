"use client";

import { TankImageBucketManager } from "../_components/TankImageBucketManager";
import { STORAGE_BUCKETS } from "@/lib/storage/buckets";

export default function TankArtPage() {
  return (
    <TankImageBucketManager
      bucket={STORAGE_BUCKETS.tankArt}
      folder="badges"
      title="Tank Art"
      description="UI decoration assets — badges, frames, and overlays rendered inside the Tank experience and gamification UI. PNG or WebP, up to 4 MB."
    />
  );
}
