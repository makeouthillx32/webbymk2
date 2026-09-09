# Tank Visual Interaction Architecture: Legacy Slash Commands & 1-Tap Tactile Action Hub

**Document ID**: `tank-visual-interaction-and-slash-command-legacy`  
**Status**: Master Product Standard & UX Architecture  
**Domain**: User Interaction, Chat UX, Item Inventory, Moderation Tools, Mobile Optimization  
**Zone**: `tank.unenter.live` (`src/zones/tank`)  

---

## 1. Executive Summary & Product Mandate

**User Decision Mandate**: Standard viewers must **never be required to memorize, remember, or manually type slash commands** to interact with Tank, use items, play minigames, or trigger stream events.

All user-facing interactive features are formally transitioned to a **1-Tap Tactile Visual Interaction System** (Visual Action Trays, Item Drawers, Contextual Action Modals, and Screen Gestures). Text slash commands are classified as **Legacy Background Protocols** preserved exclusively for Staff / Moderator administrative shortcuts (e.g., `/pin`, `/unpin`, `/clear`).

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 TANK INTERACTION PARADIGM SPLIT                                  │
├───────────────────────────────────────────────┬──────────────────────────────────────────────────┤
│    👑 REGULAR VIEWERS: 1-TAP TACTILE UI       │      🛡️ STAFF / MODS: LEGACY SLASH BACKEND       │
├───────────────────────────────────────────────┼──────────────────────────────────────────────────┤
│ • Zero memorization required                  │ • Quick-access keyboard shortcuts for staff      │
│ • Visual Action Tray & Interactive Backpack   │ • `/pin [3h|12h|24h] <message>` (Pinned alerts)  │
│ • 1-Tap Item Usage Cards (🎃 Pumpkin, 💣 Bomb)│ • `/unpin` (Immediate pin purge)                 │
│ • 1-Tap Screen Telemetry & Contextual Sheets  │ • Staff moderation & emergency console commands  │
│ • Rich visual feedback, animations, and sound │ • Purely optional backend convenience layer      │
└───────────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 2. The "Why": Flaws of User-Facing Slash Commands

| Problem | Description | Impact on Stream Experience |
| :--- | :--- | :--- |
| **Cognitive Load** | Viewers must memorize exact syntax, parameter orders, and item slug spellings (`/use_item pumpkin @target`). | Frustrates viewers and creates friction before engagement. |
| **Mobile WebKit Friction** | Switching between alphabetic, numerical, and symbol keyboards to type `/` and `@` on mobile phones breaks stream immersion. | Over 70% of viewers are on mobile; typing slash commands leads to drop-offs. |
| **Zero Discoverability** | New viewers do not know what items, commands, or minigames exist without looking up a manual or typing `/help`. | Hidden features remain unused by 95% of the audience. |
| **High Error & Typo Rate** | Typos clutter chat with dead text strings (`/use pumkin`, `/rol d20`) that fail silently or look broken. | Decreases perceived software quality and polish. |

---

## 3. The New Interaction Model: 1-Tap Tactile Action Hub

Instead of typing text commands into the chat bar, viewers interact through intuitive visual controls:

### 3.1 The Quick-Draw Action Tray (`🎒` / `⚡`)
- Positioned directly adjacent to the chat input field alongside the Emoji (`😊`) and GIF (`GIF`) buttons.
- Tapping opens an **Action Sheet / Item Drawer**:
  - Displays owned items with real icons, quantities, and descriptions (e.g., `🎃 Pumpkin (x3)`, `💣 Slime Bomb (x1)`, `🎈 Balloon (x5)`).
  - Tapping an item opens a **1-Tap Action Card** with pre-filled targets (e.g., *"Throw at Chat"*, *"Kick into Room"*).
  - One tap dispatches the event, consumes the inventory item, and triggers the animated console card.

### 3.2 Contextual Interactive Cards (Duels, Quests, Mini-Games)
- When a minigame, trivia question, or raid boss occurs:
  - An interactive **Choice Bar** or **Interactive Card** renders directly in the stream/chat flow.
  - Viewers tap on buttons (e.g., `[⚔️ Attack]`, `[🛡️ Defend]`, `[🎲 Roll D20]`) with instant visual feedback.

### 3.3 Ambient Viewport Taps (Scavenger Quests & Director Voting)
- Viewers tap directly on objects on the video feed.
- The normalized coordinates `(nx, ny)` are verified server-side without requiring the user to type anything into chat.

---

## 4. Legacy Staff Slash Command Matrix

The following commands remain active **strictly as staff shortcuts** when operating from physical keyboards:

| Command | Role Requirement | Parameters | Behavior |
| :--- | :--- | :--- | :--- |
| `/pin` | Admin / Moderator | `[3h \| 12h \| 24h] <message>` | Pins sticky announcement banner above chat with live countdown. |
| `/unpin` | Admin / Moderator | *None* | Purges active pinned message across all rooms immediately. |
| `/system` | Admin / Moderator | `<message>` | Dispatches a cybernetic cyan `[SYSTEM CONSOLE]` broadcast card. |
| `/slow` | Moderator | `[seconds]` | Toggles room chat slow mode duration. |
| `/clear` | Moderator | *None* | Flushes recent chat history from the active room feed. |

---

## 5. Architectural Implementation Guidelines

1. **Chat Input Cleanliness**:
   - The public chat input field is dedicated strictly to standard conversational text and emojis.
   - Any un-registered slash string typed by a non-staff user is gracefully sent as normal chat text rather than throwing an error or prompting a command syntax guide.
2. **Item & Game Triggers**:
   - All interactive item triggers must route through dedicated API endpoints / actions (e.g., `useInventoryItem({ itemId, target })`) invoked by visual UI components, not string parsers in chat.
3. **Staff Security Guardrail**:
   - All slash commands parsed in `handleChatSubmit` must verify `isStaff === true` before execution, falling back to standard chat messaging for standard accounts.
