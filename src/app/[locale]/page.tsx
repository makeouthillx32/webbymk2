import Page from "@/components/Page";
import ScrollUp from "@/components/Common/ScrollUp";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unenter | Home",
  description: "Explore Unenter's projects, live streams, and community.",
};

export default function Home() {
  return (
    <>
      <ScrollUp />
      <Page />
    </>
  );
}
