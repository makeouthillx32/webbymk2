"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map"), { ssr: false });

interface ContactMapProps {
  center: [number, number];
  zoom: number;
}

export function ContactMap({ center, zoom }: ContactMapProps) {
  return <Map center={center} zoom={zoom} />;
}