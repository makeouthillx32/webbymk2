# Tank Live Theme & iOS Status Bar Engine

**Document ID**: `tank-theme-and-ios-status-bar-engine`
**Status**: Active / Production Standard
**Zone**: `tank.unenter.live` (`src/zones/tank`)
**Domain**: Theming, iOS Safari Viewport, Storage Assets, and Chassis Textures

---

## 1. Overview & Dual Theme System Integration

Tank officially links to the `unenter.live` core theme engine while preserving its dedicated, single-mode arcade console design (identical light/dark modes).

Instead of rendering flat arbitrary colors, Tank supports two distinct chassis theme modes:
1. **Art Asset Mode (`tank-green` / `#637F6D`)**: Full retro painted arcade chassis (`green-bg.png`).
2. **Crafted Base + Texture Mode (`tank-blue` / `#557194`)**: Solid `#557194` base background with hardware-accelerated, tiled `asfalt-light.png` pattern overlay on top.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                TANK CHASSIS THEME ENGINE                               │
├────────────────────────────────────────┬───────────────────────────────────────────────┤
│   1. ARCADE GREEN (ARTWORK)            │   2. ARCADE BLUE (BASE + PATTERN)             │
├────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Status Bar: #637F6D                  │ • Status Bar: #557194                         │
│ • HSL: 141.43 12.39% 44.31%            │ • HSL: 213.33 27.04% 45.69%                   │
│ • Background: green-bg.png (cover)     │ • Background: #557194 base + asfalt-light.png │
│ • Palette: #637F6D / #789687 / #718F7F │ • Palette: #557194 / #6c8db5 / #466080        │
└────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## 2. Storage Bucket Assets (`tank-assets/patterns/`)

All pattern assets have been ingested into self-hosted Supabase Storage (`https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/`):

- `asfalt-light.png` (20.8 KB)
- `asfalt-dark.png` (20.8 KB)
- `metal.png` (73.1 KB)
- `concrete-wall.png` (49.1 KB)
- `brick-wall-dark.png` (3.2 KB)
- `dark-tire.png` (18.5 KB)
- `dark-wood.png` (82.0 KB)
- `otis-redding.png` (9.5 KB)
- `ice-age.png` (93.8 KB)
- `light-aluminum.png` (40.0 KB)

---

## 3. iOS Safari Status Bar & Notch Guardrail

`TankThemeStyles` ensures iOS WebKit status bar and overscroll areas match the active chassis:

1. Injects `meta[name="theme-color"]` (dynamically set to `#637F6D` or `#557194`).
2. Injects `meta[name="apple-mobile-web-app-status-bar-style"]` (`black-translucent`).
3. Sets `html, body { background-color: ${statusBarColor} }` to eliminate white flashes during inertia overscroll.
