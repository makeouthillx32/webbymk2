# Tank Live Chat Architecture: Dual Console Messages & Pinned Time-Limits

**Document ID**: `tank-console-messages-and-pins`
**Status**: Active / Production Standard
**Zone**: `tank.unenter.live` (`src/zones/tank`)
**Domain**: Realtime Chat, Ops Communication, RPG Gamification, and Moderation

---

## 1. Executive Summary

Tank Live Chat implements a clear separation between **Infrastructure & Operational Messages** versus **Interactive RPG / Item Action Messages**. Rather than treating all highlighted cards generically, the system formalizes two distinct console message types with specialized styling, life-cycles, and moderation tools, alongside a **Time-Limited Pinned Announcement System** (supporting 3h, 12h, 24h, or indefinite duration).

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TANK LIVE CHAT SYSTEM                                 │
├─────────────────────────────────────────┬───────────────────────────────────────────────┤
│    TYPE 1: SYSTEM CONSOLE [OPS/STATUS]  │   TYPE 2: RPG ITEM ACTION / RNG DROPS         │
├─────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Timestamped (e.g. 8/19/26, 4:08 PM)   │ • User + Item Icon / Emoji (e.g. 🎃 Pumpkin) │
│ • Glowing Cyan Accent & Pulsing LED     │ • Dark Slate Pill Card with Bold Action Text  │
│ • Scheduled Restarts & Maintenance      │ • Pumpkin Kick, Slime Bomb, Smoke Grenade     │
│ • Chat System Shutdown & Feed Status    │ • RNG Minigame Drops, Dice Rolls, Minigames   │
│ • Pinnable with Time Limits (3h/12h/24h)│ • Realtime Event Feedback & XP Accrual        │
└─────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 2. Dual Console Message Types Specification

### Type 1: System Console Messages (`message_type === "system" | "announcement"`)

- **Visual Presentation**:
  - **Badge Header**: Pulsing LED dot + `📟 [SYSTEM CONSOLE]`.
  - **Timestamp**: Formatted date & time (e.g. `8/19/26, 4:08 PM`) displayed in mono font on the top-right.
  - **Colorway**: Cybernetic cyan border (`border-cyan-500/40`), glowing shadow (`shadow-[0_0_15px_rgba(6,182,212,0.12)]`), dark gradient backdrop.
- **Operational Scope**:
  1. **Scheduled System Restarts**: Broadcasts upcoming container or service maintenance (e.g., *"Console notice: Scheduled backend restart in 5 minutes. Stream feeds will remain buffered."*).
  2. **Chat Subsystem Shutdowns**: Notifies viewers when chat moderation or chat server enters maintenance mode without affecting video playback.
  3. **House Status & Feed Health**: Status changes (e.g., *"Console online. House systems nominal — cameras streaming, chat live."*).
  4. **Emergency Broadcasts**: Critical security or house-wide announcements.
- **Author Identity**:
  - Always sent as `SYSTEM` (`user_id = null`, `user_role = "system"`).
  - Staff triggers the broadcast; the house authors the line.

---

### Type 2: RPG / Item Usage Action Messages (`message_type === "item_use" | "action" | "rng_drop"`)

- **Visual Presentation**:
  - **Left Avatar/Badge**: Authentic item icon image (from `tank_inventory_items`) or emoji (e.g., 🎃 Pumpkin, 💣 Bomb, 🎈 Balloon, 🧪 Slime).
  - **Typography**: Bold username (`ADMIN`, `PLAYER1`) + action phrase in crisp readable white/slate text (e.g., *"ADMIN hurls a Slime Bomb into the chat! Viscous green slime splatters across the feed!"*).
  - **Colorway**: Charcoal slate container (`bg-[#161a23]/95`), subtle border (`border-slate-700/60`), zoom-in entrance animation.
- **Operational Scope**:
  1. **Item Consumables**: Using inventory items (Pumpkin Kicks, Slime Bombs, Confetti Poppers, Megaphones, Holy Water, Golden Keys).
  2. **RNG Minigames**: Chat trivia answers, camera scavenger quest completions, house multiplier triggers.
  3. **Dice Rolls (`/roll`)**: High-stakes d20 rolls with critical fail/success badges.
  4. **XP Level Ups & Clan Milestones**: Automatic celebration cards in chat.

---

## 3. Pinned Message & Time Limit Architecture

Pinned messages display in a sticky banner at the top of the chat viewport, above the scrollable message list.

### 3.1 Time-Limit Durations

Moderators and Admins can configure the time-to-live (TTL) when pinning an announcement:

| Duration Option | Expiration Window | Recommended Use Case |
| :--- | :--- | :--- |
| **3 Hours** (`3`) | `now + 3 * 3600 * 1000` | Flash challenges, quick maintenance windows, live event reminders |
| **12 Hours** (`12`) | `now + 12 * 3600 * 1000` | Day-time house themes, temporary chat rules, daytime schedule |
| **24 Hours** (`24`) | `now + 24 * 3600 * 1000` | Daily house events, major season rules, weekly schedule kickoffs |
| **Indefinite** (`"indefinite"`) | `null` (never expires) | Standing community guidelines, primary support links |

### 3.2 State Persistence & Realtime Lifecycle

1. **Storage**: Persisted in `tank_platform_settings` under key `tank_pinned_msg_{roomId}`.
2. **Auto-Expiration**: On every fetch or poll cycle, if `Date.now() > expiresAt`, the server automatically sets `active: false` and purges the pin.
3. **Realtime Broadcast**: When pinned or unpinned, Supabase Realtime channel `room:{roomId}:chat` broadcasts event `pin_updated` containing the new `PinnedChatMessage` object or `null`.
4. **Feed Echo**: Pinned messages automatically generate an accompanying `[SYSTEM CONSOLE]` line in the chat history for auditability.

---

## 4. Backend Dispatch API & Helper Reference

### 4.1 How to Dispatch Type 1 (System Console / Ops Notices)

```typescript
import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage } from "@/zones/tank/contracts";

export async function dispatchSystemConsoleMessage(roomId = "global", body: string) {
  const admin = createAdminClient();
  const now = new Date();
  
  // 1. Persist to tank_chat_messages
  const { data: msgData } = await admin
    .from("tank_chat_messages")
    .insert({
      room_id: roomId,
      user_id: null,
      user_name: "SYSTEM",
      user_role: "system",
      body,
      message_type: "system",
    })
    .select("id, created_at")
    .single();

  const consoleMsg: ChatMessage = {
    id: msgData?.id ?? `sys-${Date.now()}`,
    user: "SYSTEM",
    body,
    time: now.toLocaleString([], {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    }),
    messageType: "system",
  };

  // 2. Broadcast to Realtime WebSocket subscribers
  const channel = admin.channel(`room:${roomId}:chat`);
  await channel.send({
    type: "broadcast",
    event: "new_message",
    payload: consoleMsg,
  });

  return consoleMsg;
}
```

### 4.2 How to Dispatch Type 2 (RPG Item Action / Minigame Events)

```typescript
import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage } from "@/zones/tank/contracts";

export async function dispatchRpgItemAction({
  roomId = "global",
  userName,
  userId,
  actionText,
  itemSlug,
  itemName,
  itemIconUrl,
}: {
  roomId?: string;
  userName: string;
  userId?: string;
  actionText: string;
  itemSlug: string;
  itemName?: string;
  itemIconUrl?: string;
}) {
  const admin = createAdminClient();
  const fullBody = `${userName} ${actionText}`;

  // 1. Persist to tank_chat_messages
  const { data: msgData } = await admin
    .from("tank_chat_messages")
    .insert({
      room_id: roomId,
      user_id: userId ?? null,
      user_name: userName,
      user_role: "member",
      body: fullBody,
      message_type: "item_use",
      item_slug: itemSlug,
      metadata: {
        item_slug: itemSlug,
        item_name: itemName,
        item_icon_url: itemIconUrl,
        event_description: actionText,
      },
    })
    .select("id, created_at")
    .single();

  const itemMsg: ChatMessage = {
    id: msgData?.id ?? `item-${Date.now()}`,
    user: userName,
    userId,
    body: fullBody,
    messageType: "item_use",
    itemSlug,
    itemName,
    itemIconUrl,
    eventDescription: actionText,
    time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };

  // 2. Broadcast to Realtime WebSocket subscribers
  const channel = admin.channel(`room:${roomId}:chat`);
  await channel.send({
    type: "broadcast",
    event: "new_message",
    payload: itemMsg,
  });

  return itemMsg;
}
```

### 4.3 How to Pin a Message with Time Limits

```typescript
import { pinChatMessage, unpinChatMessage, getActivePinnedMessage } from "@/zones/tank/server/chatPins";

// Pin for 3 hours (e.g. Scheduled Maintenance)
await pinChatMessage("global", "Scheduled system restart in 10 minutes.", 3, "SCHEDULED RESTART");

// Pin for 12 hours (e.g. House Event)
await pinChatMessage("global", "House Challenge: Scavenger hunt starts at 6 PM EST!", 12, "HOUSE EVENT");

// Pin for 24 hours (e.g. Daily Rules)
await pinChatMessage("global", "Day 14 Theme: Complete all daily missions for 2x Token Rewards!", 24, "DAILY PASS");

// Unpin immediately
await unpinChatMessage("global");
```
