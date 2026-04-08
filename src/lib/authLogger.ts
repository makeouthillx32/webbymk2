// lib/authLogger.ts
/**
 * Centralized Auth Logging System
 * Tracks user journey: Guest → Member → Admin
 */

import analytics from "@/lib/analytics";

type UserRole = "guest" | "member" | "admin";

interface AuthEvent {
  event: string;
  role: UserRole;
  userId?: string;
  email?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

class AuthLogger {
  private isDev = process.env.NODE_ENV === "development";
  private isClient = typeof window !== "undefined";

  private log(event: AuthEvent) {
    const prefix = this.getPrefix(event.role);
    const message = this.formatMessage(event);

    if (this.isDev || this.isClient) {
      console.log(prefix, message, event.metadata || "");
    }

    // Send to analytics if needed
    if (this.isClient && event.role !== "guest") {
      this.trackEvent(event);
    }
  }

  private getPrefix(role: UserRole): string {
    const prefixes: Record<UserRole, string> = {
      guest: "👤 [GUEST]",
      member: "🔐 [MEMBER]",
      admin: "👑 [ADMIN]",
    };
    return prefixes[role];
  }

  private formatMessage(event: AuthEvent): string {
    const parts = [event.event];

    if (event.userId) parts.push(`(${event.userId.slice(0, 8)}...)`);
    if (event.email) parts.push(`<${event.email}>`);

    return parts.join(" ");
  }

  private trackEvent(event: AuthEvent) {
    if (typeof window === "undefined") return;

    // ✅ 1) Preferred: your internal analytics wrapper (does not depend on window.analytics)
    try {
      if (analytics && typeof (analytics as any).trackEvent === "function") {
        (analytics as any).trackEvent("auth_event", {
          ...event,
          source: "auth_logger",
        });
        return;
      }
    } catch (e) {
      if (this.isDev) console.warn("authLogger: analytics.trackEvent failed", e);
    }

    // ✅ 2) Optional fallback: if you later add Segment/PostHog/etc. on window.analytics
    const a = (window as any).analytics;
    if (!a) return;

    // Segment-style: analytics.track(name, props)
    if (typeof a.track === "function") {
      try {
        a.track("auth_event", { ...event, source: "auth_logger" });
      } catch (e) {
        if (this.isDev) console.warn("authLogger: window.analytics.track failed", e);
      }
      return;
    }

    // Other common patterns
    const candidates: Array<(() => void) | null> = [
      typeof a.trackEvent === "function"
        ? () => a.trackEvent("auth_event", { ...event, source: "auth_logger" })
        : null,
      typeof a.event === "function"
        ? () => a.event("auth_event", { ...event, source: "auth_logger" })
        : null,
      typeof a.logEvent === "function"
        ? () => a.logEvent("auth_event", { ...event, source: "auth_logger" })
        : null,
      typeof a.capture === "function"
        ? () => a.capture("auth_event", { ...event, source: "auth_logger" })
        : null,
      typeof a.push === "function"
        ? () => a.push({ event: "auth_event", ...event, source: "auth_logger" })
        : null,
    ];

    const fn = candidates.find(Boolean);
    if (fn) {
      try {
        fn();
      } catch (e) {
        if (this.isDev) console.warn("authLogger: window.analytics fallback failed", e);
      }
      return;
    }

    if (this.isDev) {
      console.warn("authLogger: window.analytics present but no supported method", {
        keys: Object.keys(a),
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // GUEST TRACKING
  // ═══════════════════════════════════════════════════════

  guestCreated(guestId: string, metadata?: Record<string, any>) {
    this.log({
      event: "Guest profile created",
      role: "guest",
      userId: guestId,
      metadata: {
        ...metadata,
        message: "New anonymous visitor - profile created for tracking",
      },
      timestamp: new Date().toISOString(),
    });
  }

  guestViewing(guestId: string, page: string) {
    this.log({
      event: `Browsing: ${page}`,
      role: "guest",
      userId: guestId,
      metadata: { page },
      timestamp: new Date().toISOString(),
    });
  }

  guestAddedToCart(guestId: string, productId: string, productName: string) {
    this.log({
      event: "Added to cart (not signed in)",
      role: "guest",
      userId: guestId,
      metadata: { productId, productName },
      timestamp: new Date().toISOString(),
    });
  }

  guestCheckout(guestId: string, orderTotal: number) {
    this.log({
      event: "Guest checkout initiated",
      role: "guest",
      userId: guestId,
      metadata: {
        orderTotal,
        message: "Proceeding without account - email will be collected at checkout",
      },
      timestamp: new Date().toISOString(),
    });
  }

  guestConverted(guestId: string, userId: string, email: string) {
    this.log({
      event: "🎉 Guest converted to Member!",
      role: "guest",
      userId: guestId,
      metadata: {
        newUserId: userId,
        email,
        message: "Guest created account - profiles merged",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════
  // MEMBER TRACKING
  // ═══════════════════════════════════════════════════════

  memberSignUp(userId: string, email: string, metadata?: Record<string, any>) {
    this.log({
      event: "New member signed up",
      role: "member",
      userId,
      email,
      metadata: {
        ...metadata,
        message: "Account created successfully",
      },
      timestamp: new Date().toISOString(),
    });
  }

  memberSignIn(userId: string, email: string, remember: boolean) {
    this.log({
      event: "Member signed in",
      role: "member",
      userId,
      email,
      metadata: {
        remember,
        message: remember ? "Session will persist" : "Session expires on browser close",
      },
      timestamp: new Date().toISOString(),
    });
  }

  memberSessionRestored(userId: string, email: string) {
    this.log({
      event: "Session restored from cookie",
      role: "member",
      userId,
      email,
      metadata: { message: "User returned - session still valid" },
      timestamp: new Date().toISOString(),
    });
  }

  memberViewing(userId: string, email: string, page: string) {
    this.log({
      event: `Member browsing: ${page}`,
      role: "member",
      userId,
      email,
      metadata: { page },
      timestamp: new Date().toISOString(),
    });
  }

  memberProfileUpdate(userId: string, email: string, fields: string[]) {
    this.log({
      event: "Profile updated",
      role: "member",
      userId,
      email,
      metadata: {
        fields,
        message: `Updated: ${fields.join(", ")}`,
      },
      timestamp: new Date().toISOString(),
    });
  }

  memberCheckout(userId: string, email: string, orderTotal: number) {
    this.log({
      event: "Member checkout",
      role: "member",
      userId,
      email,
      metadata: {
        orderTotal,
        message: "Authenticated checkout - data will be saved to profile",
      },
      timestamp: new Date().toISOString(),
    });
  }

  memberSignOut(userId: string, email: string) {
    this.log({
      event: "Member signed out",
      role: "member",
      userId,
      email,
      metadata: { message: "Session cleared - cookies deleted" },
      timestamp: new Date().toISOString(),
    });
  }

  memberPromotedToAdmin(userId: string, email: string, promotedBy: string) {
    this.log({
      event: "⭐ Member promoted to Admin!",
      role: "member",
      userId,
      email,
      metadata: {
        promotedBy,
        message: "Role elevated to admin - dashboard access granted",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════
  // ADMIN TRACKING
  // ═══════════════════════════════════════════════════════

  adminSignIn(userId: string, email: string) {
    this.log({
      event: "👑 Admin signed in",
      role: "admin",
      userId,
      email,
      metadata: { message: "Full dashboard access granted" },
      timestamp: new Date().toISOString(),
    });
  }

  adminAccessingDashboard(userId: string, email: string, section: string) {
    this.log({
      event: `Admin accessing: ${section}`,
      role: "admin",
      userId,
      email,
      metadata: { section },
      timestamp: new Date().toISOString(),
    });
  }

  adminActionPerformed(userId: string, email: string, action: string, target?: string) {
    this.log({
      event: `Admin action: ${action}`,
      role: "admin",
      userId,
      email,
      metadata: {
        action,
        target,
        message: target ? `${action} on ${target}` : action,
      },
      timestamp: new Date().toISOString(),
    });
  }

  adminAccessDenied(userId: string, email: string, attemptedRoute: string) {
    this.log({
      event: "⚠️ Admin access DENIED",
      role: "admin",
      userId,
      email,
      metadata: {
        attemptedRoute,
        message: "User is not an admin - redirecting",
      },
      timestamp: new Date().toISOString(),
    });
  }

  adminRoleRevoked(userId: string, email: string, revokedBy: string) {
    this.log({
      event: "⚠️ Admin role revoked",
      role: "admin",
      userId,
      email,
      metadata: {
        revokedBy,
        message: "Admin privileges removed - dashboard access revoked",
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════
  // SECURITY & ERROR TRACKING
  // ═══════════════════════════════════════════════════════

  authError(error: string, context?: Record<string, any>) {
    console.error("🔴 [AUTH ERROR]", error, context || "");
  }

  securityEvent(event: string, userId?: string, metadata?: Record<string, any>) {
    console.warn("🔒 [SECURITY]", event, { userId, ...metadata });
  }

  supabaseConnection(status: "connected" | "disconnected" | "error", details?: string) {
    const emoji = status === "connected" ? "✅" : status === "disconnected" ? "⚠️" : "❌";
    console.log(`${emoji} [SUPABASE]`, status.toUpperCase(), details || "");
  }
}

export const authLogger = new AuthLogger();