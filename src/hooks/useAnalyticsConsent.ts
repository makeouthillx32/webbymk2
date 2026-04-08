// hooks/useAnalyticsConsent.ts
import { useEffect, useState } from 'react';
import { CookieManager, type CookiePreferences } from '@/components/CookieConsent';

interface AnalyticsConsentState {
  hasConsent: boolean;
  preferences: CookiePreferences | null;
  isLoading: boolean;
  updateConsent: (preferences: CookiePreferences) => void;
  revokeConsent: () => void;
}

export function useAnalyticsConsent(): AnalyticsConsentState {
  const [hasConsent, setHasConsent] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkConsent = () => {
      const { hasConsented, preferences: savedPreferences } = CookieManager.getConsent();
      
      setHasConsent(hasConsented);
      setPreferences(savedPreferences);
      setIsLoading(false);

      // Initialize analytics based on current consent
      if (hasConsented && savedPreferences) {
        CookieManager.initializeAnalytics(savedPreferences);
      }
    };

    // Check immediately
    checkConsent();

    // Listen for storage changes (in case consent is updated in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('cookie_')) {
        checkConsent();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const updateConsent = (newPreferences: CookiePreferences) => {
    CookieManager.setConsent(true, newPreferences);
    CookieManager.initializeAnalytics(newPreferences);
    setHasConsent(true);
    setPreferences(newPreferences);
  };

  const revokeConsent = () => {
    const revokedPreferences: CookiePreferences = {
      necessary: true,
      analytics: false,
      functional: false,
      marketing: false
    };
    
    CookieManager.setConsent(false, revokedPreferences);
    CookieManager.initializeAnalytics(revokedPreferences);
    setHasConsent(false);
    setPreferences(revokedPreferences);
  };

  return {
    hasConsent,
    preferences,
    isLoading,
    updateConsent,
    revokeConsent
  };
}