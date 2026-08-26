import { describe, expect, test } from "bun:test";
import {
  buildGlobalLogoutUrl,
  buildOAuthCallbackUrl,
  buildOAuthStartUrl,
  safePostAuthRedirect,
} from "./authRedirect";

describe("OAuth return targets", () => {
  test("accepts Tank absolute destinations and rejects external/auth destinations", () => {
    expect(safePostAuthRedirect("https://tank.unenter.live/house?tab=audio")).toBe(
      "https://tank.unenter.live/house?tab=audio",
    );
    expect(safePostAuthRedirect("https://evil.example/steal")).toBeNull();
    expect(safePostAuthRedirect("https://auth.unenter.live/auth/callback/oauth")).toBeNull();
  });

  test("threads the Tank destination through the auth-zone callback", () => {
    const result = new URL(buildOAuthCallbackUrl({
      currentOrigin: "https://tank.unenter.live",
      next: "https://tank.unenter.live/house",
      invite: "HOUSE",
    }));
    expect(result.origin).toBe("https://auth.unenter.live");
    expect(result.pathname).toBe("/auth/callback");
    expect(result.searchParams.get("next")).toBe("https://tank.unenter.live/house");
    expect(result.searchParams.get("invite")).toBe("HOUSE");
  });

  test("keeps local development callbacks on the current origin", () => {
    const result = new URL(buildOAuthCallbackUrl({
      currentOrigin: "http://localhost:3000",
      next: "/rooms/kitchen",
    }));
    expect(result.origin).toBe("http://localhost:3000");
    expect(result.pathname).toBe("/auth/callback");
  });

  test("starts production OAuth on Auth while preserving a safe Tank return", () => {
    expect(buildOAuthStartUrl({
      currentOrigin: "https://tank.unenter.live",
      provider: "google",
      next: "https://tank.unenter.live/rooms/kitchen",
    })).toBe(
      "https://auth.unenter.live/auth/provider/google?next=https%3A%2F%2Ftank.unenter.live%2Frooms%2Fkitchen",
    );

    expect(buildOAuthStartUrl({
      currentOrigin: "https://tank.unenter.live",
      provider: "facebook",
      next: "https://evil.example/steal",
    })).toBe("https://auth.unenter.live/auth/provider/facebook");
  });

  test("routes logout through Auth and only preserves an owned destination", () => {
    expect(buildGlobalLogoutUrl("https://tank.unenter.live/house")).toBe(
      "https://auth.unenter.live/auth/logout?next=https%3A%2F%2Ftank.unenter.live%2Fhouse",
    );
    expect(buildGlobalLogoutUrl("https://example.com/stolen")).toBe(
      "https://auth.unenter.live/auth/logout",
    );
  });
});
