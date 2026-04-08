# Desert Cowgirl Co. — Static Page HTML Authoring Guide

> **Read this before writing any HTML for a static page stored in Supabase.**

---

## The Core Problem This Prevents

Static pages are embedded inside the DCG shop layout via `extractHtmlParts()` in `app/pages/[slug]/page.tsx`. Your HTML's `<style>` block gets scoped to `.static-page-content` and injected into the live page. This means:

- `body {}` rules become `.static-page-content {}` rules
- Any layout you set on `body` affects the **content wrapper div**, not a standalone page
- `display: flex` + `align-items: center` on body = content pinned to the left on desktop
- Fixed pixel widths (`width: 600px`) on inner elements = content stuck in a narrow column

---

## ✅ The Rules

### 1. NEVER use flex centering on `body`

**❌ Wrong — causes left-shift on desktop:**
```css
body {
  display: flex;
  flex-direction: column;
  align-items: center; /* THIS IS THE KILLER */
}
```

**✅ Correct — let body be a plain block:**
```css
body {
  background-color: hsl(var(--background));
  color: var(--foreground);
  font-family: var(--font-family-base);
  line-height: 1.6;
  /* nothing else — no display, no align-items */
}
```

---

### 2. Center content using `margin: auto` on `main`, NOT flex on `body`

**❌ Wrong:**
```css
main {
  max-width: 850px;
  width: 90%;
  margin-top: -10vh; /* only sets top — left/right default to 0 */
}
```

**✅ Correct:**
```css
main {
  max-width: 850px;
  width: 90%;
  margin: -10vh auto 0; /* auto left/right = centered */
}
```

The shorthand `margin: [top] auto 0` sets left and right to `auto`, which centers the block inside its parent. Always use this pattern.

---

### 3. NEVER use fixed pixel widths on any container

Fixed widths break at desktop sizes and can't be overridden by the shop layout's CSS.

**❌ Wrong:**
```css
.container {
  width: 600px; /* fixed — will left-align on large screens */
}
```

**✅ Correct:**
```css
.container {
  max-width: 850px; /* max, not fixed */
  width: 90%;       /* fluid */
  margin: 0 auto;   /* centered */
}
```

---

### 4. Use CSS variables for all colors and fonts

The page is rendered inside the live shop theme. Use these variables — never hardcode colors or font names.

| Variable | Use |
|---|---|
| `hsl(var(--background))` | Page/section backgrounds |
| `var(--foreground)` | All text colors |
| `var(--font-family-base)` | All text |
| `hsla(var(--foreground), 0.1)` | Borders, dividers |
| `hsla(var(--foreground), 0.05)` | Subtle section backgrounds |

**❌ Wrong:**
```css
body { background: #fff; color: #333; font-family: Arial; }
```

**✅ Correct:**
```css
body { background-color: hsl(var(--background)); color: var(--foreground); font-family: var(--font-family-base); }
```

---

### 5. Hero / masked header pattern

This is the approved pattern for the top image. The `width: 100%` on the header is fine because it's not centering content — it's a full-bleed image strip.

```css
.page-header {
  width: 100%;
  height: 40vh;
  background: url('YOUR_IMAGE_URL') no-repeat center 30%;
  background-size: cover;
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}
```

```html
<header class="page-header"></header>
```

For the negative top margin that overlaps `main` with the faded hero, always pair it with `auto`:
```css
main {
  margin: -10vh auto 0; /* overlap hero + centered */
}
```

---

### 6. Full boilerplate template

Copy this every time you start a new static page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      scroll-behavior: smooth;
    }

    /* ✅ body — plain block, NO flex, NO align-items */
    body {
      background-color: hsl(var(--background));
      color: var(--foreground);
      font-family: var(--font-family-base);
      line-height: 1.6;
    }

    /* ✅ Full-bleed hero header */
    .page-header {
      width: 100%;
      height: 40vh;
      background: url('YOUR_IMAGE_URL') no-repeat center 30%;
      background-size: cover;
      -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
      mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
    }

    /* ✅ main — max-width + margin auto for centering */
    main {
      max-width: 850px;
      width: 90%;
      margin: -10vh auto 0; /* overlap hero, centered horizontally */
      position: relative;
      z-index: 5;
      padding-bottom: 100px;
    }

    /* Your page-specific styles below */

    @media (max-width: 768px) {
      main {
        margin-top: -5vh;
      }
    }
  </style>
</head>
<body>

  <header class="page-header"></header>

  <main>
    <!-- page content -->
  </main>

  <footer style="width:100%; padding:60px 0; text-align:center; border-top:1px solid hsla(var(--foreground),0.05); font-family:var(--font-family-base); opacity:0.6; font-size:0.9rem;">
    <p>© 2026 Desert Cowgirl. All Rights Reserved.</p>
  </footer>

</body>
</html>
```

---

## Quick Checklist Before Saving to Supabase

- [ ] `body` has **no** `display`, `flex-direction`, or `align-items`
- [ ] `main` uses `margin: [top] auto 0` (not just `margin-top`)
- [ ] No element has a fixed `width` in pixels — only `max-width` + `width: %`
- [ ] All colors use `var(--foreground)` / `hsl(var(--background))`
- [ ] All fonts use `var(--font-family-base)`
- [ ] Hero header uses `width: 100%` with mask gradient
- [ ] Tested mentally: "if this `<style>` block is scoped to `.static-page-content`, will it still look right?"
