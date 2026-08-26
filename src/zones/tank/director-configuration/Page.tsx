import React from "react";
import type { Metadata } from "next";
import { ACTIVE_THEME } from "../theme";
import { DirectorWorkspace } from "./components/DirectorWorkspace";

export const metadata: Metadata = {
  title: "Director AI Configuration & Virtual Canvas | Tank Console",
  description: "Dynamic Virtual Canvas Grid & TouchDesigner Kinematics Controller",
};

export default function DirectorConfigurationPage() {
  // ACTIVE_THEME carries fonts, fontFaces and images — there is no `colors`
  // key. This page was the only place in the zone that assumed otherwise, and
  // reading `.colors.chassis.bg` threw on every render, which is why the
  // director console 500'd instead of rendering the canvas. The chassis look
  // comes from the same aluminium texture the rest of the console uses.
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
        <DirectorWorkspace />
      </div>
    </main>
  );
}
