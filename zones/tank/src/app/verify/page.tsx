import type { Metadata } from "next";
import TankVerifyPage from "@/zones/tank/verify/VerifyPage";

export const metadata: Metadata = {
  title: "Verify Your Account | Tank LIVE",
  description: "Verify your email address to activate full chat and streaming privileges on Tank LIVE.",
};

export default function VerifyPage() {
  return <TankVerifyPage />;
}
