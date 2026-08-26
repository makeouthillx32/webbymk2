# Viewport Gesture Detection & IRL Director Attention Engine

**Document ID**: `tank-viewport-gestures-and-irl-director`
**Status**: Architecture & Developer Research Standard
**Domain**: Viewport Interaction, Realtime Heatmaps, Touch Telemetry, IRL Multi-Cam Director Switching

---

## 1. Coordinate System Accuracy: Which is Best?

When capturing user taps and touch gestures over video feeds across diverse client hardware (iPhone 15 Pro, Android foldables, iPad split-view, 4K Ultrawide desktop monitors), different spatial representations offer distinct advantages:

```
┌────────────────────────┬──────────────────────────────────────────┬────────────────────────────────────────┐
│ COORDINATE SYSTEM      │ RESOLUTION INDEPENDENCE                  │ BEST USE CASE                          │
├────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ 1. Normalized (0.0-1.0)│ 100% portable across all viewports       │ Precision clicks, object tracking,     │
│    (nx, ny)            │ `nx = (clientX - rect.left) / width`     │ pinpointing specific in-video items    │
├────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ 2. Tri-Zone Columns    │ High-speed integer quantization          │ 3-Cam IRL Mukbang / Split-cam voting   │
│    (0, 1, 2)           │ `zoneIndex = Math.floor(nx * 3)`         │ (Left vs Center vs Right person)       │
├────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ 3. Spatial Heatmap Bins│ Ultra-compact aggregation matrix         │ 10x10 / 100x100 Viewer Crowd Density   │
│    (h_X_Y)             │ `h_${heatX}_${heatY}`                    │ (Aggregates 10,000 taps into counters) │
├────────────────────────┼──────────────────────────────────────────┼────────────────────────────────────────┤
│ 4. Viewport Pixels     │ ❌ Broken across different screen sizes  │ Internal native gesture offsets only   │
└────────────────────────┴──────────────────────────────────────────┴────────────────────────────────────────┘
```

### The Verdict:
1. **Primary Accuracy**: **Normalized Float Coordinates (`nx: 0.000` to `1.000`)** is the gold standard because it directly maps to the video matrix regardless of device resolution, aspect ratio, or CSS scaling.
2. **Director Logic Accuracy**: **Quantized Zone Indexing** (`0` = Left Friend, `1` = Center Friend, `2` = Right Friend) is the highest-performance representation for instant stream switching.

---

## 2. Browser & Hardware Gesture Acceptance

### iOS WebKit & Safari:
- **Pointer Events API** (`pointerdown`, `pointerup`): Fully supported since iOS 13.
- **Passive Capture Guarantee**: `addEventListener('pointerdown', handler, { passive: true })` ensures Safari's scroll engine and video hardware decoding never experience frame drops.
- **Zero Frontend Footprint**: Runs completely silently in background memory without adding visual overlays or mutating the DOM.

### Desktop & Android:
- Normalizes mouse clicks, trackpad taps, and touch events into the exact same unified `TouchEventPayload`.

---

## 3. The 3-Friend IRL Mukbang Workflow (Director Focus Automation)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        VIEWER INTERACTIONS ON SCREEN VIEWPORT                          │
├───────────────────────────────────┬────────────────────────────────────────────────────┤
│ Left Third [0.0 - 0.33]           │ Taps on Friend A (Cam IRL-1)                       │
│ Center Third [0.33 - 0.66]        │ Taps on Friend B (Cam IRL-2)                       │
│ Right Third [0.66 - 1.00]         │ Taps on Friend C (Cam IRL-3)                       │
└───────────────────────────────────┴────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Batch broadcasted every 1.5s via Realtime)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND DIRECTOR HEURISTIC ENGINE                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Aggregates zone votes over a rolling 3-second sliding window:                        │
│    `{ 0: 420 votes, 1: 180 votes, 2: 890 votes }`                                      │
│ 2. Determines winner: `Zone 2` (Friend C) with 59.7% of crowd attention.               │
│ 3. Issues Director Cut: Automatically routes main stream / Director feed to `IRL-3`!  │
│ 4. Adds hysteresis cooldown (e.g. minimum 6s dwell time) to prevent jarring cuts.      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Implementation Reference

- Client Hook: [`src/zones/tank/public/useInvisibleTouchTelemetry.ts`](file:///Z:/WEBSITES/webbymk2/src/zones/tank/public/useInvisibleTouchTelemetry.ts)
- Backend Broadcast Topic: `telemetry:viewport_gestures`
- Payload:
  ```ts
  {
    nx: 0.8452, // 84.52% from left
    ny: 0.4120, // 41.20% from top
    zoneIndex: 2, // Right third
    gridId: "h_8_4", // Heatmap bucket
    pointerType: "touch",
    timestamp: 1787179800000,
    camSlug: "director"
  }
  ```



---

## 5. Platform Bifurcation: Mobile Ambient Touch vs Desktop Gesture Box

To make gestures feel natural across different input devices without causing UI collisions:

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│              MOBILE (iOS / ANDROID)           │              DESKTOP (MOUSE / TRACKPAD)       │
├───────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Input: Direct capacitive multi-touch        │ • Input: Cursor pointer                       │
│ • Paradigm: Native Ambient Tap                │ • Paradigm: "Gesture Box" Focus Mode          │
│ • Behavior: Tapping directly on the feed      │ • Behavior: An optional clickable gesture box │
│   works seamlessly like TikTok / Reels        │   (Cookie Clicker style) opens up, allowing   │
│   without needing extra UI wrappers.          │   spam-clicking anywhere without triggering   │
│ • WebKit vs Chromium:                        │   browser text highlights or video pauses.    │
│   - iOS Safari: `-webkit-tap-highlight-color` │ • Avoids conflict with standard video pause,  │
│     is suppressed to keep it native.          │   volume sliders, and full-screen controls.   │
│   - Mobile Chrome: Uses passive pointer streams│                                               │
└───────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### Browser & Device Detection Heuristic
```ts
export function detectGestureEnvironment() {
  if (typeof window === "undefined") return { isMobile: false, isWebKit: false, isChromium: false };
  
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || window.matchMedia("(max-width: 768px)").matches;
  const isWebKit = /WebKit/i.test(ua) && !/Chrome/i.test(ua);
  const isChromium = /Chrome|Chromium|CriOS/i.test(ua);

  return {
    isMobile,
    isIOS,
    isAndroid,
    isWebKit,
    isChromium,
    mode: isMobile ? "ambient_touch" : "gesture_box",
  };
}
```



---

## 6. TouchDesigner Normalized Bounding Boxes & Scavenger Quests

Backend computer vision or TouchDesigner operators emit normalized spatial bounding boxes `[xMin, yMin, xMax, yMax]` scaled `0.000` to `1.000`.

### Scavenger Target Specification (`interactiveTargetDetector.ts`)
```ts
export type BoundingBox = {
  xMin: number; // 0.000 to 1.000 (Normalized Left)
  yMin: number; // 0.000 to 1.000 (Normalized Top)
  xMax: number; // 0.000 to 1.000 (Normalized Right)
  yMax: number; // 0.000 to 1.000 (Normalized Bottom)
};

export type InteractiveTarget = {
  id: string;
  camSlug: string;
  label: string; // e.g. "trash", "lost sock", "secret key"
  box: BoundingBox;
  xpReward: number; // e.g. 15 XP
  maxClaimsPerUser: number; // e.g. 3 claims per target
  active: boolean;
};
```

### Hit-Testing & Live Console Announcements
1. **Zero Frontend Footprint**: Bounding box coordinates exist **only on the server**. The user sees clean, un-overlayed raw video.
2. **Invisible Hit-Test**: When a user taps anywhere on screen, `nx` and `ny` are sent via silent telemetry.
3. **Threshold & Claim Limit**: If inside the box, increments quota (up to `maxClaimsPerUser = 3`).
4. **Console Broadcast**:
   - `[SYSTEM CONSOLE] Tyler, you just found 1 piece of trash! (+15 XP) [1/3]`
   - `[SYSTEM CONSOLE] Tyler, you just found 1 piece of trash! (+15 XP) [2/3]`
   - `[SYSTEM CONSOLE] Tyler, you just found 1 piece of trash! (+15 XP) [3/3]`
5. **Gamification Link**: Automatically executes `awardTargetXp(userId, 15)` to recalculate user level in `tank_profiles`.
