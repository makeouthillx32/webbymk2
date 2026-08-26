import type { Metadata } from "next";
import { createAdminClient } from "@/utils/supabase/admin";
import { OverlayPlayer } from "./OverlayPlayer";

export const metadata: Metadata = {
  title: "Tank Overlay",
  description: "Live browser-source overlay for OBS.",
};

export default async function OverlayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: scene } = await admin
    .from("tank_overlay_scenes")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!scene) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-transparent">
        <p className="text-xs font-mono text-red-500">No overlay scene found for "{slug}".</p>
      </div>
    );
  }

  return <OverlayPlayer sceneId={scene.id} sceneName={scene.name} />;
}
