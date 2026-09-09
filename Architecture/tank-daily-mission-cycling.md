# Tank Daily Mission Cycling & Per-User RNG Rotation Architecture

**Document ID**: `tank-daily-mission-cycling`  
**Status**: Core Architecture Standard  
**Domain**: Gamification, Daily Directives, Personalized RNG, Mission Expansion  
**Zone**: `tank.unenter.live` (`src/zones/tank`)  

---

## 1. Overview & Mechanics

To keep chat dynamic and prevent everyone from executing the exact same action simultaneously, **daily missions are personalized and randomized on a per-user, daily basis**:

1. **Per-User RNG Shuffle**:
   - Each viewer receives a unique, non-repeating set of **2 to 3 active missions** selected from the master mission pool.
   - User A might get `[Watch Cam, Chat Msg, Roll Luck]`, while User B gets `[Press T 20x, Use Item, Scavenger Hunt]`.
2. **Deterministic Day Consistency**:
   - For any given user, their daily set remains identical throughout that calendar day (persisting across page reloads, tab closes, and device switches).
3. **Midnight UTC Auto-Rotation**:
   - At `00:00:00 UTC`, the daily seed rolls over, seamlessly serving each viewer a fresh random batch.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               PERSONALIZED DAILY MISSION MATRIX                             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  MASTER POOL (N Missions)           PER-USER DAILY SEED            PERSONALIZED DAILY SET   │
│  ┌───────────────────────────┐      ┌─────────────────────────┐    ┌───────────────────────┐│
│  │ • Sign in first time      │      │ Seed = hash(            │    │ User Tyler:           ││
│  │ • Watch a live camera     │ ───► │   userId + YYYY-MM-DD   │ ─► │  • Roll Luck          ││
│  │ • Post first chat message │      │ )                       │    │  • Watch Cam          ││
│  │ • Press T for Tank (20x)  │      └─────────────────────────┘    │  • Chat Msg           ││
│  │ • Roll Luck (/roll /flip) │                                     ├───────────────────────┤│
│  │ • Use an Inventory Item   │                                     │ User Sarah:           ││
│  │ • House Scavenger Hunt    │                                     │  • Use Item           ││
│  │ • Tip a Chatter 1 Token   │                                     │  • Press T 20x        ││
│  │ • Trigger Soundboard SFX  │                                     │  • Scavenger Hunt     ││
│  └───────────────────────────┘                                     └───────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. How to Methodically Add New Missions to the Pool

New missions can be added directly to the `public.tank_missions` database table:

```sql
INSERT INTO public.tank_missions (key, category, title, description, reward_tokens, reward_xp, target_count, sort_order, is_active)
VALUES
  (
    'tip_chatter_token',
    'chatter',
    'Tip a Fellow Viewer',
    'Send a 1-token tip to any active chatter in the room.',
    15,
    35,
    1,
    8,
    true
  ),
  (
    'watch_30_minutes',
    'explorer',
    'Dedicated Watcher (30m)',
    'Stay connected to live house camera feeds for 30 minutes.',
    25,
    60,
    30,
    9,
    true
  )
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_tokens = EXCLUDED.reward_tokens,
  reward_xp = EXCLUDED.reward_xp,
  target_count = EXCLUDED.target_count,
  is_active = EXCLUDED.is_active;
```

As soon as a new mission is marked `is_active = true`, it is immediately woven into the daily RNG lottery pool for all viewers!
