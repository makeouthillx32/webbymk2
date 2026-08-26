import type { Metadata } from "next";
import { DocsPage } from "../public/DocsPage";

export const metadata: Metadata = {
  title: "Documentation & Roadmap - Tank LIVE",
  description: "Official guide, game mechanics, and feature roadmap for tank.unenter.live",
};

export default function TankDocsPage() {
  return <DocsPage />;
}
