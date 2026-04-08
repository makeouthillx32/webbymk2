## Member Contract v1 (Signed-in user)

A **member** is an authenticated user with a valid session (Supabase Auth) and a corresponding `profiles` row.

### Members can access

* Everything a guest can access (full shop browsing, cart, checkout).
* `/profile/me` and all account pages:

  * view/update profile (display name, avatar)
  * saved addresses (if you support them)
  * order history + order details (when implemented)
* Any “member-only” features you add later (favorites/wishlist, saved carts, etc.).

### Members cannot access

* Any admin-only areas (`/dashboard/*`, `/settings/*`, management UIs) unless their role grants it.

### Required UX behavior

* If a member visits a **member-only page**, it must load without re-auth prompts or dead-ends.
* If a member visits an **admin-only page** without permission, they must get a clean **403/Not allowed** (or redirect to `/profile/me`), not a sign-in prompt.

### Identity + data rules

* The current user identity is determined by session; `/profile/me` always resolves to the signed-in user.
* If a member tries `/profile/{someone-else}`, they are redirected to `/profile/me`.
* Orders created while signed in should attach `auth_user_id` and/or `profile_id` (not null).
