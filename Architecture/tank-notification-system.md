# Tank Notification Center: Functional Architecture & Event Matrix

**Document ID**: `tank-notification-system`  
**Status**: Core Architecture Standard  
**Domain**: Notifications UX, Realtime Events, Category Filtering, Read/Unread State  
**Zone**: `tank.unenter.live` (`src/zones/tank`)  

---

## 1. Overview & Functional Philosophy

The Tank Notification Center provides a real-time, categorized event log for viewers. It mirrors the high-utility functional mechanics of modern interactive streaming platforms (such as Fishtank) while preserving unenter's cybernetic arcade aesthetic.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NOTIFICATIONS ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  [ Notifications ]            [ 🔥 All ] [ 🪙 Tokens ] [ 📢 TTS ] [ 🪝 Toys ] [ ⚔️ Combat ] │
│                                                                           [ 📜 Quests ]     │
│  [ Mark All Read ]                                                   UNREAD ONLY: ( ON/OFF )│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  • 🔊 "Your TTS message has been approved!"                               8/17/26, 2:46 AM  │
│  • 💣 "BIGR attacked you with a grenade for 936 XP"                       6/24/25, 1:00 AM  │
│  • 🪙 "You were tipped ₮1 from trish!"                                   12/21/23, 12:08 AM │
│  • 📜 "Daily login streak claimed! +25 Tokens & +50 XP"                   8/26/26, 8:00 AM  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Functional Features

### 2.1 Six Category Filters
1. **All (`🔥`)**: Unfiltered aggregate stream of all notifications.
2. **Tokens (`🪙`)**: Economy transactions, tips, purchases, coin drops.
3. **TTS / Audio (`📢`)**: TTS approval alerts, soundboard triggers, voice queue notifications.
4. **Tanktoys (`🪝`)**: Fishing loot, toy activations, scavenger findings.
5. **Wartoys & Combat (`⚔️`)**: PvP attacks, grenades, duels, slime bombs, combat XP.
6. **Missions & Quests (`📜`)**: Daily login streaks, quest milestones, level-up rewards.

### 2.2 Unread Management & Toggling
- **`[ Mark All Read ]` Button**: 1-click action marking all notifications as read and clearing the unread notification badge across the UI.
- **`UNREAD ONLY` Toggle Switch**: Instantly toggles between viewing all historical notifications vs. only unread items.
- **1-Tap Card Read Trigger**: Tapping any individual unread notification card immediately transitions it to read state and decreases the unread badge counter.
- **Unread Indicator Dot**: Pulsing red indicator on all unread cards for high visual clarity.

### 2.3 Persistent State
- Reads and persists to `safeStorage` under the protected key `"tank_user_notifications"`.
- Prevents quota eviction during browser storage sweeps on mobile devices.
