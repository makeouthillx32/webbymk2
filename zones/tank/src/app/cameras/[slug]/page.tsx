import type { Metadata } from "next";
import CameraPageClient from "@/zones/tank/public/CameraPageClient";
import { PublicShell } from "@/zones/tank/public/PublicShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Camera | Tank",
  description: "An individual live camera feed on Tank.",
};
export default async function CameraRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <PublicShell>
      <CameraPageClient slug={slug} />
    </PublicShell>
  );
}
