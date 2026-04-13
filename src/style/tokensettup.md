Perfect. Since you're grouping layout/nav colors under `--gp-*`, we can experiment safely without breaking your global design tokens.

Right now you're tying everything to `--primary-foreground`, which makes the nav feel “flat” and too similar to page surfaces.

Below are **4 different direction presets**.
You can copy one at a time and test.

---

# 🔥 OPTION 1 — Warm Branded Nav (Stronger Identity)

Makes the nav feel like a branded top layer instead of blending into the page.

```css
:root {
  --gp-bg:         hsl(var(--primary));
  --gp-fg:         hsl(var(--primary-foreground));
  --gp-border:     hsl(var(--primary) / 0.4);
  --gp-shadow:     var(--shadow-md);
  --gp-status-bar: hsl(var(--primary));
}

.dark {
  --gp-bg:         hsl(var(--primary));
  --gp-fg:         hsl(var(--primary-foreground));
  --gp-border:     hsl(var(--primary) / 0.5);
  --gp-shadow:     var(--shadow-lg);
  --gp-status-bar: hsl(var(--primary));
}
```

**Result:**

* Strong western brand energy
* Feels like a true header layer
* Good for storefront vibe

---

# 🧊 OPTION 2 — Frosted Soft Neutral (Modern / iOS Style)

Makes nav subtle and layered, very clean.

```css
:root {
  --gp-bg:         hsl(var(--card));
  --gp-fg:         hsl(var(--foreground));
  --gp-border:     hsl(var(--border));
  --gp-shadow:     var(--shadow-sm);
  --gp-status-bar: hsl(var(--card));
}

.dark {
  --gp-bg:         hsl(var(--card));
  --gp-fg:         hsl(var(--foreground));
  --gp-border:     hsl(var(--border));
  --gp-shadow:     var(--shadow-md);
  --gp-status-bar: hsl(var(--card));
}
```

**Result:**

* Feels like floating glass
* Much softer
* Good if content is primary focus

---

# 🐎 OPTION 3 — Earthy Western Tone (Desert Feel)

Leans into Desert Cowgirl aesthetic.

```css
:root {
  --gp-bg:         hsl(var(--secondary));
  --gp-fg:         hsl(var(--secondary-foreground));
  --gp-border:     hsl(var(--secondary) / 0.5);
  --gp-shadow:     var(--shadow-md);
  --gp-status-bar: hsl(var(--secondary));
}

.dark {
  --gp-bg:         hsl(var(--accent));
  --gp-fg:         hsl(var(--accent-foreground));
  --gp-border:     hsl(var(--accent) / 0.6);
  --gp-shadow:     var(--shadow-lg);
  --gp-status-bar: hsl(var(--accent));
}
```

**Result:**

* Feels warm
* Unique identity
* More boutique than SaaS

---

# ⚡ OPTION 4 — Elevated Contrast System (Structured UI)

Creates stronger hierarchy between nav and page.

```css
:root {
  --gp-bg:         hsl(var(--background));
  --gp-fg:         hsl(var(--foreground));
  --gp-border:     hsl(var(--border));
  --gp-shadow:     var(--shadow-lg);
  --gp-status-bar: hsl(var(--background));
}

.dark {
  --gp-bg:         hsl(var(--card));
  --gp-fg:         hsl(var(--foreground));
  --gp-border:     hsl(var(--border));
  --gp-shadow:     var(--shadow-xl);
  --gp-status-bar: hsl(var(--card));
}
```

**Result:**

* Clean structure
* Strong separation
* More “pro dashboard” energy

---

# 🎯 My Recommendation For You (DCG context)

Since you’re building:

* Boutique storefront
* Admin dashboard
* iOS style nav
* Dark/light support

I would test in this order:

1. **Option 3 (Earthy Western)** → Most brand aligned
2. **Option 2 (Frosted Neutral)** → Most modern
3. Option 1 if you want bold header energy

---

If you want, I can:

* 🔬 Create a hybrid preset just for iOS nav
* 🎨 Slightly shift your primary hue to be more desert-burnt
* 🧠 Create a “Nav System Hierarchy Model” so your layout never feels flat again
