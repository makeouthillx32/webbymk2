// src/lib/edge/zerotrust.test.ts
import { describe, it, expect } from "bun:test";
import { evaluateZeroTrustAccess, matchesZeroTrustPolicy } from "./zerotrust";

describe("Zero Trust Edge Gatekeeper", () => {
  it("allows public paths without restriction", () => {
    const res = evaluateZeroTrustAccess("/room/living-room", null);
    expect(res.allowed).toBe(true);
  });

  it("blocks unauthenticated visitors on /house and redirects to sign-in", () => {
    const res = evaluateZeroTrustAccess("/house", null);
    expect(res.allowed).toBe(false);
    expect(res.redirectTo).toContain("/sign-in");
  });

  it("blocks non-admin authenticated users from /house", () => {
    const user = { id: "user_123", app_metadata: { is_admin: false } };
    const res = evaluateZeroTrustAccess("/house", user);
    expect(res.allowed).toBe(false);
    expect(res.redirectTo).toContain("403_FORBIDDEN");
  });

  it("grants access to verified admin operators", () => {
    const adminUser = { id: "admin_123", app_metadata: { is_admin: true, role: "admin" } };
    const res = evaluateZeroTrustAccess("/house", adminUser);
    expect(res.allowed).toBe(true);
  });
});
