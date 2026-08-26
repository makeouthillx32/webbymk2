import type { Metadata } from "next";
import TankVerifyPage from "@/zones/tank/verify/VerifyPage";

export const metadata: Metadata = {
  title: "Verify Your Tank Account | unenter.live",
  description: "Confirm your email address for Tank LIVE.",
};

export default function TankVerifyRoutePage() {
  return <TankVerifyPage />;
}
