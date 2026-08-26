import type { Metadata } from "next";
import { Suspense } from "react";
import { HouseConsole } from "./HouseConsole";
import { requireTankStaff } from "./requireTankStaff";

export const metadata: Metadata = {
  title: "Tank House Console | Staff & Moderator Controls",
  description: "Moderator and Admin control plane for house and room operations.",
};

export default async function HousePage() {
  const { displayName, role } = await requireTankStaff();

  return (
    <Suspense fallback={null}>
      <HouseConsole
        operatorName={displayName}
        operatorRole={role}
      />
    </Suspense>
  );
}
