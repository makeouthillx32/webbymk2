"use client";

import React from "react";
import { Package } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import type { TankInventoryEntry } from "../../server/gamification";
import { DEFAULT_AUTHENTIC_ITEMS } from "./InventoryOverlay";
import { getTankItemIcon, getTankItemEmoji } from "../../tankItemCatalog";
import { PanelCollapseButton } from "./PanelCollapseButton";

export type InventoryPanelProps = {
  inventory?: TankInventoryEntry[];
  onOpenShop: () => void;
  onOpenInventory?: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function InventoryPanel({
  inventory = [],
  onOpenShop,
  onOpenInventory,
  expanded = true,
  onExpandedChange,
}: InventoryPanelProps) {
  // Map real database items or fallback to DEFAULT_AUTHENTIC_ITEMS
  const mappedItems = inventory.length > 0
    ? inventory.map((entry) => {
        const rarity = entry.rarity?.toLowerCase() || "common";
        const rarityColor =
          rarity === "legendary"
            ? "#eab308"
            : rarity === "epic"
            ? "#a855f7"
            : rarity === "rare"
            ? "#3b82f6"
            : rarity === "uncommon"
            ? "#22c55e"
            : "none";

        const rawSlug = entry.slug || entry.itemId;
        const iconUrl = getTankItemIcon(rawSlug, entry.iconUrl);
        const emoji = getTankItemEmoji(rawSlug);

        return {
          id: entry.itemId,
          name: entry.name,
          quantity: entry.quantity,
          iconUrl,
          emoji,
          rarityColor,
          description: entry.description || undefined,
        };
      })
    : DEFAULT_AUTHENTIC_ITEMS;

  const totalItemCount = mappedItems.reduce((acc, it) => acc + it.quantity, 0);
  const displaySlots = Array.from({ length: 8 }).map((_, i) => mappedItems[i] || null);

  return (
    <ChromePanel
      withScrews
      className="w-full cursor-pointer transition-all hover:brightness-105"
      contentClassName="!p-0"
    >
      {/* Header with Title and Shop Button */}
      <div className="flex h-9 items-center justify-between gap-2 border-b border-black/40 px-4">
        <p
          onClick={onOpenInventory}
          className="text-[10px] font-black uppercase tracking-[.18em] text-white hover:text-yellow-400 select-none"
          style={{ fontFamily: ACTIVE_THEME.fonts.label }}
        >
          Inventory ({totalItemCount})
        </p>
        <div className="flex items-center gap-1.5">
          {expanded && (
            <ConsoleButton
              variant="orange"
              className="!px-2.5 !py-1 !text-[9px]"
              onClick={(e) => {
                e.stopPropagation();
                onOpenShop();
              }}
            >
              Get Toys
            </ConsoleButton>
          )}
          {onExpandedChange && (
            <PanelCollapseButton
              title="Inventory"
              expanded={expanded}
              onExpandedChange={onExpandedChange}
            />
          )}
        </div>
      </div>

      {/* 8-slot grid with authentic item icons */}
      {expanded && <div className="grid grid-cols-4 gap-2 px-6 py-4" onClick={onOpenInventory}>
        {displaySlots.map((item, i) => {
          if (!item) {
            return (
              <div
                key={`empty-panel-slot-${i}`}
                className="grid aspect-square place-items-center rounded-lg bg-[#121417] border border-white/5 shadow-inner"
              />
            );
          }

          const hasBorder = item.rarityColor !== "none";
          return (
            <div
              key={item.id}
              className={`group relative grid aspect-square place-items-center rounded-lg bg-[#181a1f] p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6)] hover:scale-105 transition-all overflow-hidden ${
                hasBorder ? "border" : "border border-white/15"
              }`}
              style={{
                borderColor: hasBorder ? item.rarityColor : undefined,
              }}
              title={`${item.name} (${item.quantity})\n${item.description || ""}`}
            >
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                  className="h-full w-full object-contain pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] select-none"
                />
              ) : null}
              <div
                className={`h-full w-full items-center justify-center text-lg select-none pointer-events-none ${
                  item.iconUrl ? "hidden" : "flex"
                }`}
              >
                {item.emoji || "📦"}
              </div>
              {item.quantity > 0 && (
                <span className="absolute bottom-0.5 right-1 text-[9px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] select-none font-mono">
                  {item.quantity}
                </span>
              )}
            </div>
          );
        })}
      </div>}
    </ChromePanel>
  );
}

export default InventoryPanel;
