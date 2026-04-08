"use client";

import * as React from "react";
import { Check, Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CookieConsentManager } from "@/lib/analytics"; // ✅ Import from analytics.ts

// Cookie consent categories
export interface CookiePreferences {
  necessary: boolean;      // Always true, can't be disabled
  analytics: boolean;      // Your custom analytics system
  functional: boolean;     // Session management, preferences
  marketing: boolean;      // Future use (currently unused)
}

// Define prop types
interface CookieConsentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "small" | "mini";
  demo?: boolean;
  onAcceptCallback?: (preferences: CookiePreferences) => void;
  onDeclineCallback?: (preferences: CookiePreferences) => void;
  onCustomizeCallback?: (preferences: CookiePreferences) => void;
  description?: string;
  learnMoreHref?: string;
  showCustomize?: boolean;
}

// ✅ UPDATED: Cookie management utility functions using analytics.ts
const CookieManager = {
  CONSENT_COOKIE_NAME: 'cookie_consent_v1',
  PREFERENCES_COOKIE_NAME: 'cookie_preferences_v1',
  CONSENT_EXPIRY_DAYS: 365,

  // Set consent status
  setConsent(hasConsented: boolean, preferences: CookiePreferences): void {
    const expiryDate = new Date();
    expiryDate.setTime(expiryDate.getTime() + (this.CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
    
    // Set consent cookie
    document.cookie = `${this.CONSENT_COOKIE_NAME}=${hasConsented}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
    
    // Set preferences cookie
    document.cookie = `${this.PREFERENCES_COOKIE_NAME}=${JSON.stringify(preferences)}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
    
    console.log('🍪 Cookie consent set:', { hasConsented, preferences });
  },

  // Get consent status - delegate to analytics.ts
  getConsent(): { hasConsented: boolean; preferences: CookiePreferences | null } {
    if (typeof document === 'undefined') {
      return { hasConsented: false, preferences: null };
    }

    const consentCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${this.CONSENT_COOKIE_NAME}=`));
    
    const preferencesCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${this.PREFERENCES_COOKIE_NAME}=`));

    if (!consentCookie) {
      return { hasConsented: false, preferences: null };
    }

    const hasConsented = consentCookie.split('=')[1] === 'true';
    
    let preferences: CookiePreferences | null = null;
    if (preferencesCookie) {
      try {
        preferences = JSON.parse(preferencesCookie.split('=')[1]);
      } catch (error) {
        console.warn('⚠️ Failed to parse cookie preferences:', error);
      }
    }

    return { hasConsented, preferences };
  },

  // Clear analytics data - delegate to analytics.ts
  clearAnalyticsData(): void {
    if (typeof window !== 'undefined') {
      // Clear analytics session data
      localStorage.removeItem('analytics_session_id');
      localStorage.removeItem('analytics_last_activity');
      sessionStorage.removeItem('analytics_session_id');
      
      // Clear any other analytics-related localStorage items
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('analytics_') || key.startsWith('tracking_')) {
          localStorage.removeItem(key);
        }
      });

      console.log('🧹 Analytics data cleared due to consent change');
    }
  },

  // Check if analytics is allowed - delegate to analytics.ts  
  isAnalyticsAllowed(): boolean {
    return CookieConsentManager.isAnalyticsAllowed();
  },

  // Initialize analytics - delegate to analytics.ts
  initializeAnalytics(preferences: CookiePreferences): void {
    if (typeof window !== 'undefined' && window.analytics) {
      if (preferences.analytics) {
        console.log('✅ Analytics enabled via cookie consent');
        window.analytics.enable();
        // Analytics will automatically initialize due to consent monitoring
      } else {
        console.log('🚫 Analytics disabled via cookie consent');
        window.analytics.disable();
        this.clearAnalyticsData();
      }
    }
  }
};

const CookieConsent = React.forwardRef<HTMLDivElement, CookieConsentProps>(
  (
    {
      variant = "default",
      demo = false,
      onAcceptCallback = () => {},
      onDeclineCallback = () => {},
      onCustomizeCallback = () => {},
      className,
      description = "We use cookies to enhance your experience and analyze site usage. Essential cookies are required for basic functionality.",
      learnMoreHref = "/privacy-policy",
      showCustomize = false,
      ...props
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [hide, setHide] = React.useState(false);
    const [showPreferences, setShowPreferences] = React.useState(false);
    const [preferences, setPreferences] = React.useState<CookiePreferences>({
      necessary: true,   // Always enabled
      analytics: true,   // Default to enabled
      functional: true,  // Default to enabled
      marketing: false   // Default to disabled
    });

    // Handle accept all cookies
    const handleAcceptAll = React.useCallback(() => {
      const acceptAllPreferences: CookiePreferences = {
        necessary: true,
        analytics: true,
        functional: true,
        marketing: true
      };

      CookieManager.setConsent(true, acceptAllPreferences);
      CookieManager.initializeAnalytics(acceptAllPreferences);
      
      setIsOpen(false);
      setTimeout(() => setHide(true), 700);
      onAcceptCallback(acceptAllPreferences);
    }, [onAcceptCallback]);

    // Handle decline non-essential cookies
    const handleDeclineAll = React.useCallback(() => {
      const declinePreferences: CookiePreferences = {
        necessary: true,
        analytics: false,
        functional: false,
        marketing: false
      };

      CookieManager.setConsent(true, declinePreferences);
      CookieManager.initializeAnalytics(declinePreferences);
      
      setIsOpen(false);
      setTimeout(() => setHide(true), 700);
      onDeclineCallback(declinePreferences);
    }, [onDeclineCallback]);

    // Handle save custom preferences
    const handleSavePreferences = React.useCallback(() => {
      CookieManager.setConsent(true, preferences);
      CookieManager.initializeAnalytics(preferences);
      
      setIsOpen(false);
      setTimeout(() => setHide(true), 700);
      onCustomizeCallback(preferences);
    }, [preferences, onCustomizeCallback]);

    // Initialize component
    React.useEffect(() => {
      try {
        if (demo) {
          setIsOpen(true);
          return;
        }

        const { hasConsented, preferences: savedPreferences } = CookieManager.getConsent();
        
        if (hasConsented && savedPreferences) {
          console.log('🍪 Existing consent found:', savedPreferences);
          CookieManager.initializeAnalytics(savedPreferences);
          setHide(true);
        } else {
          console.log('🍪 No consent found - showing banner');
          setIsOpen(true);
        }
      } catch (error) {
        console.warn('Cookie consent initialization error:', error);
        setIsOpen(true);
      }
    }, [demo]);

    if (hide) return null;

    const containerClasses = cn(
      "fixed z-50 transition-all duration-700",
      !isOpen ? "translate-y-full opacity-0" : "translate-y-0 opacity-100",
      className,
    );

    const commonWrapperProps = {
      ref,
      className: cn(
        containerClasses,
        variant === "mini"
          ? "left-0 right-0 sm:left-4 bottom-4 w-full sm:max-w-3xl"
          : "bottom-0 left-0 right-0 sm:left-4 sm:bottom-4 w-full sm:max-w-md",
      ),
      ...props,
    };

    // Preferences panel
    if (showPreferences) {
      return (
        <div {...commonWrapperProps}>
          <Card className="m-3 shadow-lg max-h-[80vh] overflow-y-auto">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                Cookie Preferences
                <Cookie className="h-5 w-5" />
              </CardTitle>
              <CardDescription className="text-sm">
                Choose which cookies you'd like to accept. You can change these settings at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Necessary Cookies */}
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">Necessary Cookies</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required for basic site functionality. These cannot be disabled.
                  </p>
                </div>
                <div className="ml-3">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled={true}
                    className="rounded border-gray-300"
                  />
                </div>
              </div>

              {/* Analytics Cookies */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">Analytics Cookies</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Help us understand how you use our site to improve your experience.
                  </p>
                </div>
                <div className="ml-3">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => setPreferences(prev => ({ ...prev, analytics: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                </div>
              </div>

              {/* Functional Cookies */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">Functional Cookies</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enable enhanced features and personalization.
                  </p>
                </div>
                <div className="ml-3">
                  <input
                    type="checkbox"
                    checked={preferences.functional}
                    onChange={(e) => setPreferences(prev => ({ ...prev, functional: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                </div>
              </div>

              {/* Marketing Cookies */}
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">Marketing Cookies</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Used to deliver personalized ads (currently not in use).
                  </p>
                </div>
                <div className="ml-3">
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(e) => setPreferences(prev => ({ ...prev, marketing: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 pt-2">
              <Button
                onClick={() => setShowPreferences(false)}
                variant="outline"
                className="flex-1"
              >
                Back
              </Button>
              <Button onClick={handleSavePreferences} className="flex-1">
                Save Preferences
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    // Default consent banner variants
    if (variant === "default") {
      return (
        <div {...commonWrapperProps}>
          <Card className="m-3 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">We use cookies</CardTitle>
              <Cookie className="h-5 w-5" />
            </CardHeader>
            <CardContent className="space-y-2">
              <CardDescription className="text-sm">
                {description}
              </CardDescription>
              <a
                href={learnMoreHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-4 hover:no-underline"
              >
                Learn more about our cookie policy
              </a>
            </CardContent>
            <CardFooter className="flex gap-2 pt-2">
              <Button
                onClick={handleDeclineAll}
                variant="secondary"
                className="flex-1"
              >
                Decline
              </Button>
              {showCustomize && (
                <Button
                  onClick={() => setShowPreferences(true)}
                  variant="outline"
                  className="flex-1"
                >
                  Customize
                </Button>
              )}
              <Button onClick={handleAcceptAll} className="flex-1">
                Accept All
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    if (variant === "small") {
      return (
        <div {...commonWrapperProps}>
          <Card className="m-3 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4">
              <CardTitle className="text-base">We use cookies</CardTitle>
              <Cookie className="h-4 w-4" />
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-4">
              <CardDescription className="text-sm">
                {description}
              </CardDescription>
            </CardContent>
            <CardFooter className="flex gap-2 py-2 px-4">
              <Button
                onClick={handleDeclineAll}
                variant="secondary"
                size="sm"
                className="rounded-full"
              >
                Decline
              </Button>
              <Button
                onClick={handleAcceptAll}
                size="sm"
                className="rounded-full"
              >
                Accept
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    if (variant === "mini") {
      return (
        <div {...commonWrapperProps}>
          <Card className="mx-3 p-0 py-3 shadow-lg">
            <CardContent className="sm:flex grid gap-4 p-0 px-3.5">
              <CardDescription className="text-xs sm:text-sm flex-1">
                {description}
              </CardDescription>
              <div className="flex items-center gap-2 justify-end sm:gap-3">
                <Button
                  onClick={handleDeclineAll}
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                >
                  Decline
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  size="sm"
                  className="text-xs h-7"
                >
                  Accept
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return null;
  },
);

CookieConsent.displayName = "CookieConsent";

// ✅ FIXED: Only export what's needed, no duplicate CookieManager
export { CookieConsent };
export default CookieConsent;
export type { CookiePreferences };

// Global type declaration for analytics
declare global {
  interface Window {
    analytics?: {
      enable: () => void;
      disable: () => void;
      init: () => void;
      getStats: () => any;
    };
  }
}