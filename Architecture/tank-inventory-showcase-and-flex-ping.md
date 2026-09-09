# Tank Inventory Feature: Item Showcase & "Flex" Ping Engine

**Document ID**: `tank-inventory-showcase-and-flex-ping`  
**Status**: Feature Design & Engineering Specification  
**Domain**: Gamification, Social Flexing, Chat Console Events, Inventory UX  
**Zone**: `tank.unenter.live` (`src/zones/tank`)  

---

## 1. Concept: "The Trophy Catch" (Item Showcase)

Like a fisherman holding up a prized trophy fish for friends to admire, viewers should be able to show off rare items they've collected, unlocked, or unboxed **without consuming them**.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                             INVENTORY ITEM SHOWCASE (FLEX PING)                             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│   🎒 INVENTORY MODAL                 CHAT CONSOLE BROADCAST                                  │
│  ┌───────────────────────┐          ┌───────────────────────────────────────────────────┐   │
│  │ 🦶 Foot-Detector 3000 │          │ 📟 [ITEM SHOWCASE]                                │   │
│  │ Rarity: LEGENDARY     │  TAP     │ @Tyler whipped out their [Foot-Detector 3000]     │   │
│  │ Quantity: 1           │  FLEX    │ (✨ LEGENDARY STATUS) and holds it up for the     │   │
│  ├───────────────────────┤ ───────► │ entire room to see!                               │   │
│  │ [ USE ]  [ ✨ FLEX ]  │          └───────────────────────────────────────────────────┘   │
│  └───────────────────────┘                                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Interaction Flow

1. **Open Backpack / Inventory Drawer**:
   - Viewer taps the Inventory icon (`🎒`) next to the chat bar or in their Profile Drawer.
   - All owned items are rendered with real SVG badges and rarity border glows (Common, Rare, Epic, Legendary, Mythic).
2. **Item Action Selector**:
   - Tapping an item opens two clear visual choices:
     - **`[ USE ITEM ]`**: Consumes 1x item, triggers the item effect/reward, and grants XP/Tokens.
     - **`[ ✨ FLEX / SHOWCASE ]`**: Does **NOT** consume the item. Triggers a room-wide chat showcase announcement.
3. **Showcase Broadcast & Cooldown**:
   - Dispatches a Type 2 RPG Action event with message type `item_flex`.
   - Has a gentle per-user cooldown (e.g. 30 seconds) to prevent spamming while allowing fun social flexing.

---

## 3. Dynamic Rarity & Flavor Text Matrix

| Item | Rarity | Showcase Action Text ("Holding up the Fish") |
| :--- | :--- | :--- |
| **Foot-Detector 3000** | ✨ LEGENDARY | `whips out their Foot-Detector 3000 (✨ LEGENDARY STATUS) — the radar needles spin wildly as everyone watches in awe!` |
| **Royal Jelly** | ✨ LEGENDARY | `holds up a glistening jar of Royal Jelly (✨ LEGENDARY) — it catches the studio lights with an iridescent golden shimmer!` |
| **Lightsaber** | 🧪 RARE | `flourishes their Plasma Lightsaber (🧪 RARE) with a crisp *vzzzzzt* to flex on the chat!` |
| **Launch Keys** | 🧪 RARE | `twirls dual Launch Keys (🧪 RARE) around their finger with supreme authority!` |
| **Didgeridoo** | 🧪 RARE | `hoists up their Didgeridoo (🧪 RARE) and strikes a heroic stance before the stream!` |
| **Golden Remote** | 🏆 MYTHIC | `raises the fabled Golden Remote (🏆 MYTHIC) skyward — holy beam of light bathes the chat feed!` |
| **Deed to Tank** | 🏆 MYTHIC | `unfurls the official Deed to Tank (🏆 MYTHIC) stamped with the royal red wax seal!` |

---

## 4. Technical Architecture

### 4.1 Backend Action Endpoint (`showcaseInventoryItem`)
```typescript
export async function showcaseInventoryItem({
  userId,
  roomId = "global",
  itemSlug,
}: {
  userId: string;
  roomId?: string;
  itemSlug: string;
}) {
  const admin = createAdminClient();

  // 1. Verify the user actually owns the item in tank_player_inventory
  const { data: inventoryRow } = await admin
    .from("tank_player_inventory")
    .select("quantity, tank_inventory_items(slug, name, rarity, icon_url)")
    .eq("user_id", userId)
    .eq("tank_inventory_items.slug", itemSlug)
    .maybeSingle();

  if (!inventoryRow || inventoryRow.quantity < 1) {
    return { success: false, error: "You don't own this item!" };
  }

  // 2. Fetch user profile display name
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  const userName = profile?.display_name || "Anonymous";
  const item = inventoryRow.tank_inventory_items as any;

  // 3. Dispatch Item Flex Chat Broadcast (Zero consumption)
  const actionText = getShowcaseFlavorText(item.slug, item.name, item.rarity);
  
  return dispatchRpgItemAction({
    roomId,
    userId,
    userName,
    actionText,
    itemSlug: item.slug,
    itemName: item.name,
    itemIconUrl: item.icon_url,
  });
}
```

### 4.2 Chat Card Presentation
- Styled with the item's glowing rarity border (`itemRarity.ts`).
- Centered or pill card badge: `[✨ ITEM SHOWCASE]`.
- Non-destructive: viewer retains all their items.
