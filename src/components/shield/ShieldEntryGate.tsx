import React from "react";
import { cookies, headers } from "next/headers";
import { verifyClearanceToken } from "@/lib/shield/crypto";
import { SHIELD_COOKIE_NAME } from "@/lib/shield/types";
import ShieldEntryGateClient from "./ShieldEntryGateClient";

export interface ShieldEntryGateProps {
  children: React.ReactNode;
  zoneTitle?: string;
  description?: string;
  forceChallenge?: boolean;
}

export default async function ShieldEntryGate({
  children,
  zoneTitle,
  description = "This website uses a security service to protect against automated bots.",
  forceChallenge = false,
}: ShieldEntryGateProps) {
  const cookieStore = await cookies();
  const headersList = await headers();

  const rawHost =
    headersList.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headersList.get("host") ||
    "unenter.live";

  const clientIp =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip") ||
    "127.0.0.1";

  const clearanceCookie = cookieStore.get(SHIELD_COOKIE_NAME)?.value;

  const isVerified =
    !forceChallenge && clearanceCookie
      ? (await verifyClearanceToken(clearanceCookie, rawHost, clientIp)).valid
      : false;

  if (isVerified) {
    return <>{children}</>;
  }

  const title = zoneTitle || rawHost;

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-black text-white flex flex-col justify-between p-6 sm:p-12 md:p-16 selection:bg-orange-500 selection:text-black">
      <div className="max-w-lg mx-auto w-full pt-8 sm:pt-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2 break-words">
          {title}
        </h1>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-200 mb-3">
          Performing security verification
        </h2>
        <p className="text-sm sm:text-base text-gray-400 leading-relaxed mb-8">
          {description} Please complete the verification below to proceed.
        </p>
        <div className="my-6 flex justify-start">
          <ShieldEntryGateClient />
        </div>
      </div>
      <div className="max-w-lg mx-auto w-full pt-8 border-t border-neutral-900 text-center text-xs text-neutral-600">
        <p>
          Performance & Security by{" "}
          <strong className="text-neutral-400 font-semibold">Unenter Edge Shield</strong> |
          Zero-Redirect Interstitial
        </p>
      </div>
    </div>
  );
}
