"use client";

import Link from "next/link";
import { TankStorePanel } from "@/zones/tank/public/components/TankStorePanel";

const TOKEN_PACKS = ["tokens_500", "tokens_1500", "tokens_5000"] as const;

export function TankTokenShopSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-6">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff4d00]">
          Tank x Unenter Shop
        </p>
        <h2 className="mt-2 text-3xl font-black tracking-tight">Tank Token Packs</h2>
        <p className="mb-6 mt-2 max-w-xl text-sm text-muted-foreground">
          Top up the same Tank balance used for interactive house features, TTS, SFX, and games.
          Inventory and token purchases do not require a Season Pass.
        </p>

        <TankStorePanel productKeys={[...TOKEN_PACKS]} />

        <Link
          className="mt-5 inline-block text-sm font-bold text-[#ff4d00] hover:underline"
          href="https://tank.unenter.live/"
        >
          Return to Tank
        </Link>
      </div>
    </section>
  );
}

