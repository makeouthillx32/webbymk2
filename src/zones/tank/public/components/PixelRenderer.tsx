"use client";

// Takes over a react-three-fiber canvas's rendering with the house's pixel
// pass (pixel/pixelPass.ts). A priority-1 frame callback means r3f stops
// rendering on its own; this renders whichever camera is current each frame.

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { DEFAULT_PIXEL_SIZE, PixelPass } from "../pixel/pixelPass";

export default function PixelRenderer({ pixelSize = DEFAULT_PIXEL_SIZE }: { pixelSize?: number }) {
  const size = useThree((state) => state.size);
  const pass = useMemo(() => new PixelPass(), []);
  useEffect(() => () => pass.dispose(), [pass]);
  useEffect(() => {
    pass.setSize(size.width, size.height, pixelSize);
  }, [pass, size.width, size.height, pixelSize]);
  useFrame(({ gl, scene, camera }) => {
    pass.render(gl, scene, camera);
  }, 1);
  return null;
}
