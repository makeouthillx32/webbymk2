## Admin Contract v1 (Back Office Users)

An **admin** is an authenticated member with elevated role permissions stored in `profiles.role` (or equivalent role system). Admins operate the back office of DCG.

We define **two admin classes** under one umbrella:

* **Operations Admin** (merchandising + order handling)
* **Developer Admin** (system + content architecture)

---

# Core Admin Capabilities (All Admins)

Admins can access:

* `/dashboard/*`
* `/settings/*`
* Management interfaces for:

  * Products
  * Categories
  * Collections
  * Landing sections
  * Orders
  * Members (limited to role-appropriate scope)

Admins must never see guest/member UX redirects.
Admin routes must never show a sign-in prompt if already authenticated.

If authenticated but lacking required role → return **403 (Not Authorized)**, not redirect to sign-in.

---

# Operations Admin Responsibilities

Focus: Commerce operations.

Can:

* Create / edit / delete products
* Manage product variants
* Upload product images
* Assign categories and collections
* Manage landing section placement
* View all orders
* Update order status (processing, shipped, delivered, cancelled)
* Add internal order notes
* View customer shipping/billing info
* View payment status (read-only Stripe data)
* Issue restock actions if applicable

Cannot:

* Modify database schema
* Modify system configuration
* Access developer settings
* Change role architecture

---

# Developer Admin Responsibilities

Focus: System and architecture.

Can:

* Modify landing renderer configuration
* Create static CMS pages
* Manage route visibility rules
* Manage feature flags
* Adjust environment-driven behaviors
* Manage role definitions
* Promote/demote admins
* Perform data-level corrections
* Access advanced system logs (if implemented)

Cannot:

* Be restricted by merchandising workflows
* Be limited by UI-only permission toggles

---

# Identity & Security Rules

1. Admin must always be authenticated.
2. Role must be verified server-side (never trust client).
3. All `/dashboard` and `/settings` routes must:

   * Validate session
   * Validate role
   * Return 403 if role insufficient
4. Orders viewed by admin must not rely on user session filtering.
5. Admin edits must log `updated_by` when possible (future hardening).

---

# Admin UX Guarantees

* No “random auth prompts”
* No partial access to management UIs
* No silent failures
* All restricted areas fail clearly and consistently

---

# Current System Implication

Your system currently supports:

* `profiles.role`
* `/dashboard` and `/settings` route groups
* Order table structure
* Product management system

What’s missing (likely):

* Formal role hierarchy (admin vs dev-admin)
* Centralized server role validation helper
* Consistent 403 handling component

---

If you want next step:

We define a **Role Matrix Contract** that formalizes:

* guest
* member
* admin-ops
* admin-dev

With explicit route-to-role mapping.

That’s the piece that eliminates 90% of access chaos.
