# Tank User Profile & Gamification Isolation Protocol

**Document ID**: `tank-user-profile-and-gamification-isolation`
**Status**: Active Production Standard
**Domain**: Multi-Tenant Auth, Tank Isolation, PostgreSQL Schema Architecture

---

## 1. Multi-Profile Separation Policy

Because `webbymk2` hosts multiple zones and applications with distinct authentication footprints, **Tank gamification and inventory state is 100% isolated to Tank-specific database tables**.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE POSTGRESQL LAYER                                 │
├─────────────────────────────────────┬──────────────────────────────────────────────────┤
│ TANK DEDICATED TABLES               │ SHARED CORE TABLES (DO NOT TOUCH FOR TANK STATE) │
├─────────────────────────────────────┼──────────────────────────────────────────────────┤
│ • `public.tank_profiles`            │ • `public.profiles` (Core general metadata only) │
│ • `public.tank_player_inventory`    │ • `public.user_roles`                            │
│ • `public.tank_inventory_items`     │ • `public.orders`                                │
│ • `public.tank_token_transactions`  │ • `public.blog_posts`                            │
│ • `public.tank_mission_progress`    │                                                  │
│ • `public.tank_missions`            │                                                  │
│ • `public.tank_clans`               │                                                  │
│ • `public.tank_clan_members`        │                                                  │
│ • `public.tank_chat_messages`       │                                                  │
│ • `public.tank_cameras`             │                                                  │
└─────────────────────────────────────┴──────────────────────────────────────────────────┘
```

---

## 2. Tank Profile Data Model (`tank_profiles`)

Every Tank viewer's gameplay state lives exclusively in `tank_profiles`:

| Column | Type | Purpose |
| :--- | :--- | :--- |
| `user_id` | `UUID PK` | References `auth.users(id)`. |
| `display_name` | `TEXT` | Tank-specific handle. |
| `xp` | `BIGINT` | Tank watch time, minigames, scavenger & item XP. |
| `level` | `INTEGER` | Tank Rank Level: `floor(sqrt(xp / 10)) + 1`. |
| `tokens` | `BIGINT` | Tank arcade tokens ($UNT) balance. |
| `settings` | `JSONB` | Tank chassis theme, pattern, audio volumes, slots. |
| `created_at` | `TIMESTAMPTZ` | Account initialization timestamp. |
| `updated_at` | `TIMESTAMPTZ` | Last gamification activity timestamp. |

---

## 3. Inventory & Economy Ledger

1. **Items Catalog (`tank_inventory_items`)**:
   - Master definition of all 12 authentic items (Launch Keys, Love Letter, Boxing Gloves, Sword Toy, Batteries, Deed, Crisp Shorts, Mystery Concoction, Didgeridoo, Dirty Mask, Royal Jelly, Smashed Monitor).
2. **Player Inventory (`tank_player_inventory`)**:
   - Unique per `(user_id, item_id)` pair with real integer `quantity`.
3. **Token Audit Ledger (`tank_token_transactions`)**:
   - Double-entry ledger recording every token earned, spent, or won (Prize machine, daily claim, TTS audio playback, crafting).
4. **Prize Machine & Crafting**:
   - Runs server-side transactions against `tank_player_inventory` and `tank_profiles`.
