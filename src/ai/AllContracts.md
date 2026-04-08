## The contract (simple rules)

### Public (guest OK)

* Shop browsing, product pages, collections/categories
* Cart + checkout (guest checkout allowed)
* Static pages (About, Policies, etc.)
* Sign-in / sign-up / password reset

### Member-only

* `/profile/*`
* Order history, saved addresses, account settings
* Anything “dashboard/app” related

### Admin-only

* `/dashboard/*`, `/settings/*` (your management UIs)

The key is: **every protected route must behave the same way**.