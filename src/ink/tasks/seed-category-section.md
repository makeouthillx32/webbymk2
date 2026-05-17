# TUI Task: Seed category section after zone scaffold

## When to run
Immediately after a new zone is successfully written to `public.zones` and its
scaffold files are generated. Run this as the final step of the zone creation
pipeline — after `zone-scaffold.ts` completes, before the TUI returns to the
zone list.

## What to do

Make an authenticated POST request to the dashboard API:

```
POST https://<dashboard-domain>/api/categories/create-section
Content-Type: application/json
Authorization: Bearer <supabase-user-jwt>

{ "section": "<zone.key>" }
```

Use the **user's JWT** (not the service role key) — the route checks
`supabase.auth.getUser()` and is intentionally scoped to authenticated users,
not anonymous callers.

`zone.key` is the same short identifier used everywhere else (e.g. `"blog"`,
`"rappers"`, `"shop2"`). It must be lowercase, alphanumeric + hyphens.

## What happens

The Postgres function `create_category_section(p_section)` runs:

- **New section** → inserts 4 starter categories (Getting Started, Featured,
  Popular, New Arrivals) all tagged `section = zone.key`. Returns `{ created:
  true, count: 4 }`.
- **Section already exists** → no-op. Returns `{ created: false, count: 0 }`.
  Safe to call again on retry or re-scaffold.

The dashboard **Category Header** page (`/settings/categories`) will
automatically detect the new tab on its next load — no extra wiring needed.

## What NOT to do

- Do **not** modify the `zones` table schema.
- Do **not** touch `LayoutBranches.tsx`, route classifiers, Dockerfiles, or any
  zone build files.
- Do **not** call this with `section: "shop"` — it is reserved and the API will
  reject it with a 400.
- Do **not** use the Supabase service role key from the TUI process — use the
  authenticated user session JWT instead.

## Error handling

| Status | Meaning | Action |
|--------|---------|--------|
| 200 `{ created: false, count: 0 }` | Section already seeded | Continue normally |
| 200 `{ created: true, count: 4 }` | Seeded successfully | Continue normally |
| 400 | Invalid section name or reserved | Log warning, skip — zone scaffold still succeeded |
| 401 | Not authenticated | Surface auth error to user |
| 500 | DB error | Log, surface to user, zone scaffold still succeeded |

A non-200 from this endpoint should **never block** zone creation. Log the
error and continue — the user can always manage categories manually from the
dashboard.

## Implementation location

Wire this call into `src/ink/zone-scaffold.ts` or `src/ink/zone-ops.ts`,
whichever fires after the zone row is committed to `public.zones`. A simple
`fetch` call at the end of the success path is sufficient.

```ts
// After zone scaffold succeeds:
try {
  const res = await fetch(`${DASHBOARD_URL}/api/categories/create-section`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${userJwt}`,
    },
    body: JSON.stringify({ section: zone.key }),
  });
  const json = await res.json();
  if (json.created) {
    log(`✓ Seeded ${json.count} starter categories for section "${zone.key}"`);
  }
} catch {
  // Non-blocking — log only
  log(`⚠ Could not seed categories for "${zone.key}" — do it manually in the dashboard`);
}
```
