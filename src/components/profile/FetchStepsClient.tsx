// components/profile/FetchStepsClient.tsx
"use client";

import dynamic from "next/dynamic";

const FetchDataSteps = dynamic(() => import("../tutorial/fetch-data-steps"), {
  ssr: false,
});

export default function FetchStepsClient() {
  return <FetchDataSteps />;
}