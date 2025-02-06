import Hero from "@/components/Hero";
import Page from "@/components/Page";
import Hero2 from "@/components/Hero2";
import Hero3 from "@/components/Hero3";
import Services from "@/components/Services";
import Brands from "@/components/Brands";
import ScrollUp from "@/components/Common/ScrollUp";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "",
  description: "Wir bringen Ihre Ideen in Form",
  // other metadata
};

export default function Home() {
  return (
    <>
      <ScrollUp />
      <Page />

    </>
  );
}
