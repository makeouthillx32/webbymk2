import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTankStaff } from "../requireTankStaff";
import { LabelLab } from "./LabelLab";

export const metadata: Metadata = {
  title: "Label Lab | Tank House",
  description: "Grade what the house saw today: confirm the AI's guesses, name guests, strike bad crops.",
};

export default async function LabelLabPage() {
  await requireTankStaff();
  return (
    <Suspense fallback={null}>
      <LabelLab />
    </Suspense>
  );
}
