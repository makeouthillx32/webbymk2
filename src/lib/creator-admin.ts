// lib/creator-admin.ts
// Shared guard for the creator/affiliate admin API routes. Thin alias over
// lib/require-admin.ts's requireAdmin() — kept as its own export so the
// creator routes' imports don't need to change, and so the name still
// documents *why* those routes require admin (creator payouts are money-
// adjacent, worth being explicit at the call site).
export { requireAdmin as requireCreatorAdmin } from "@/lib/require-admin";
