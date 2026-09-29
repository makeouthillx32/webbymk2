import React from "react";
import type { Metadata } from "next";
import { ACTIVE_THEME } from "../theme";
import { DirectorWorkspace } from "./components/DirectorWorkspace";

export const metadata: Metadata = {
  title: "Director AI Configuration & Virtual Canvas | Tank Console",
  description: "Dynamic Virtual Canvas Grid & TouchDesigner Kinematics Controller",
};

import { getServerDirectorState } from "../server/serverDirectorEngine";
import { loadPersistedOperatorModeFromDb } from "../server/directorTelemetryStore";
import { loadRotationRosterFromDb } from "../server/directorRotationStore";

export default async function DirectorConfigurationPage() {
  const [initialServerDirector, initialMode, initialRoster] = await Promise.all([
    getServerDirectorState().catch(() => null),
    loadPersistedOperatorModeFromDb().catch(() => null),
    loadRotationRosterFromDb().catch(() => null),
  ]);

  return (
    <main
      className="min-h-screen p-4 sm:p-6 lg:p-8"
      style={{
        backgroundColor: "#0d0e10",
        backgroundImage: `url(${ACTIVE_THEME.images.aluminumTexture})`,
        backgroundBlendMode: "overlay",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <DirectorWorkspace
          initialServerDirector={initialServerDirector}
          initialMode={initialMode}
          initialRoster={initialRoster}
        />
      </div>
    </main>
  );
}
