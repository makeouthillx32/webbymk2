import { Camera } from "lucide-react";
import { CameraDirectoryClient } from "./CameraDirectoryClient";
import { PublicShell } from "./PublicShell";

export default function CamerasPage() {
  return (
    <PublicShell>
      <div className="container py-10 md:py-14">
        <div className="flex items-end gap-4">
          <span className="bg-primary/10 grid h-12 w-12 place-items-center rounded-2xl text-primary">
            <Camera className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[.18em] text-primary">
              Auto-discovered
            </p>
            <h1 className="text-4xl font-black tracking-tight">
              Camera directory
            </h1>
          </div>
        </div>
        <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
          Each valid camera connection has its own feed and stable URL. The
          Director program is separate and may show any one of these same feeds.
        </p>
        <div className="mt-8">
          <CameraDirectoryClient />
        </div>
      </div>
    </PublicShell>
  );
}
