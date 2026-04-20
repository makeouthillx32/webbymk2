// src/zones/shop/Page.tsx
// Core: Shop root page — served at shop.unenter.live/
// Imports from src/components/shop/ (safe — survives zone Dockerfile wipe)

import type { Metadata } from "next";
import HomePage from "@/components/shop/Landing";

export const metadata: Metadata = {
  title:       "Shop | Unenter",
  description: "Browse products, collections, and more.",
};

export default function ShopPage() {
  return (
    <main className="flex-grow">
      <HomePage />
    </main>
  );
}
