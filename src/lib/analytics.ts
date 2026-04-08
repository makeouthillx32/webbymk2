// lib/analytics.ts - UPDATED WITH COOKIE CONSENT INTEGRATION
import { v4 as uuidv4 } from 'uuid';

interface PerformanceMetric {
  type: 'LCP' | 'FID' | 'CLS' | 'TTFB';
  value: number;
}

interface DeviceInfo {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  timezone: string;
}

interface TrackingPayload {
  pageUrl: string;
  pageTitle?: string;
  referrer?: string;
  userAgent: string;
  sessionId: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  timezone?: string;
  loadTime?: number;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}

interface EventPayload {
  sessionId: string;
  eventName: string;
  eventCategory?: string;
  eventAction?: string;
  eventLabel?: string;
  eventValue?: number;
  pageUrl?: string;
  metadata?: Record<string, any>;
}

// Cookie consent interfaces
interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

// Cookie management utilities
const CookieConsentManager = {
  CONSENT_COOKIE_NAME: 'cookie_consent_v1',
  PREFERENCES_COOKIE_NAME: 'cookie_preferences_v1',

  // Check if analytics tracking is allowed
  isAnalyticsAllowed(): boolean {
    if (typeof document === 'undefined') return false;

    const consentCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${this.CONSENT_COOKIE_NAME}=`));
    
    const preferencesCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${this.PREFERENCES_COOKIE_NAME}=`));

    if (!consentCookie || consentCookie.split('=')[1] !== 'true') {
      return false;
    }

    if (preferencesCookie) {
      try {
        const preferences: CookiePreferences = JSON.parse(preferencesCookie.split('=')[1]);
        return preferences.analytics === true;
      } catch (error) {
        console.warn('⚠️ Failed to parse cookie preferences:', error);
        return false;
      }
    }

    return false;
  },

  // Clear analytics-related storage when consent is revoked
  clearAnalyticsData(): void {
    if (typeof window === 'undefined') return;

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

    console.log('🧹 Analytics data cleared due to consent revocation');
  }
};

class AnalyticsClient {
  private sessionId: string;
  private apiBase: string;
  private isInitialized = false;
  private isEnabled = true;
  private consentCheckInterval: NodeJS.Timeout | null = null;
  private trackingStats = {
    pageViews: 0,
    events: 0,
    performance: 0,
    errors: 0,
    consentBlocked: 0
  };

  constructor(apiBase = '/api/analytics') {
    this.apiBase = apiBase;
    this.sessionId = this.initSession();
    console.log('📊 Analytics Client initialized:', {
      sessionId: this.sessionId,
      apiBase: this.apiBase,
      consentRequired: true
    });
  }

  // Check consent before any tracking operation
  private checkConsent(): boolean {
    const isAllowed = CookieConsentManager.isAnalyticsAllowed();
    
    if (!isAllowed) {
      this.trackingStats.consentBlocked++;
      console.log('🍪 Analytics tracking blocked - no consent');
      return false;
    }
    
    return true;
  }

  // UPDATED: Initialize session with consent checking
  private initSession(): string {
    if (typeof window === 'undefined') {
      return uuidv4(); // Server-side fallback
    }

    // Don't create/use sessions without consent
    if (!CookieConsentManager.isAnalyticsAllowed()) {
      console.log('🍪 Session creation blocked - awaiting consent');
      return uuidv4(); // Temporary session for initialization
    }

    // Try to get session from localStorage first (persists across browser tabs/sessions)
    let existingSession = localStorage.getItem('analytics_session_id');
    
    // If no localStorage session, check sessionStorage (tab-specific)
    if (!existingSession) {
      existingSession = sessionStorage.getItem('analytics_session_id');
    }
    
    // Check if session is still valid (not older than 30 minutes of inactivity)
    const lastActivity = localStorage.getItem('analytics_last_activity');
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in ms
    
    if (existingSession && lastActivity) {
      const timeSinceLastActivity = now - parseInt(lastActivity);
      
      if (timeSinceLastActivity < thirtyMinutes) {
        // Session is still valid, update last activity
        localStorage.setItem('analytics_last_activity', now.toString());
        sessionStorage.setItem('analytics_session_id', existingSession);
        console.log('🔄 Reusing valid session:', existingSession);
        return existingSession;
      } else {
        console.log('⏰ Session expired, creating new one');
        // Session expired, clear old data
        localStorage.removeItem('analytics_session_id');
        localStorage.removeItem('analytics_last_activity');
        sessionStorage.removeItem('analytics_session_id');
      }
    }

    // Generate new session ID
    const newSessionId = uuidv4();
    
    // Store in both localStorage and sessionStorage (only if consent given)
    if (CookieConsentManager.isAnalyticsAllowed()) {
      localStorage.setItem('analytics_session_id', newSessionId);
      localStorage.setItem('analytics_last_activity', now.toString());
      sessionStorage.setItem('analytics_session_id', newSessionId);
      console.log('✨ Created new session with consent:', newSessionId);
    } else {
      console.log('✨ Created temporary session (no storage):', newSessionId);
    }
    
    return newSessionId;
  }

  // Update last activity on each tracking call (only with consent)
  private updateActivity(): void {
    if (typeof window !== 'undefined' && CookieConsentManager.isAnalyticsAllowed()) {
      const now = Date.now();
      localStorage.setItem('analytics_last_activity', now.toString());
    }
  }

  // Get device and browser information
  private getDeviceInfo(): DeviceInfo {
    if (typeof window === 'undefined') {
      return {
        userAgent: '',
        screenWidth: 0,
        screenHeight: 0,
        language: 'en',
        timezone: 'UTC'
      };
    }

    const info = {
      userAgent: navigator.userAgent || '',
      screenWidth: screen.width || 0,
      screenHeight: screen.height || 0,
      language: navigator.language || 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };

    // Only log device info if consent is given
    if (CookieConsentManager.isAnalyticsAllowed()) {
      console.log('🖥️ Device info collected:', {
        device: this.detectDeviceType(info.userAgent),
        browser: this.extractBrowser(info.userAgent),
        os: this.extractOS(info.userAgent),
        screen: `${info.screenWidth}x${info.screenHeight}`,
        language: info.language,
        timezone: info.timezone
      });
    }

    return info;
  }

  // Helper functions for device detection (for logging)
  private detectDeviceType(userAgent: string): string {
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
    if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
    return 'desktop';
  }

  private extractBrowser(userAgent: string): string {
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome') && !ua.includes('edge')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    return 'unknown';
  }

  private extractOS(userAgent: string): string {
    if (!userAgent) return 'unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    return 'unknown';
  }

  // Extract UTM parameters from URL
  private getUtmParams(url?: string): TrackingPayload['utmParams'] {
    if (typeof window === 'undefined' && !url) return undefined;
    
    try {
      const urlToCheck = url || window.location.href;
      const urlObj = new URL(urlToCheck);
      const params = urlObj.searchParams;

      const utmParams: TrackingPayload['utmParams'] = {};
      
      if (params.get('utm_source')) utmParams.source = params.get('utm_source')!;
      if (params.get('utm_medium')) utmParams.medium = params.get('utm_medium')!;
      if (params.get('utm_campaign')) utmParams.campaign = params.get('utm_campaign')!;
      if (params.get('utm_term')) utmParams.term = params.get('utm_term')!;
      if (params.get('utm_content')) utmParams.content = params.get('utm_content')!;

      const hasUtmParams = Object.keys(utmParams).length > 0;
      if (hasUtmParams && CookieConsentManager.isAnalyticsAllowed()) {
        console.log('🎯 UTM parameters detected:', utmParams);
      }

      return hasUtmParams ? utmParams : undefined;
    } catch (error) {
      console.warn('⚠️ Error parsing UTM params:', error);
      return undefined;
    }
  }

  // UPDATED: Auto-track page views with consent check
  async trackPageView(url?: string): Promise<void> {
    if (typeof window === 'undefined' || !this.isEnabled) return;

    // Check consent before tracking
    if (!this.checkConsent()) return;

    // Update activity timestamp
    this.updateActivity();

    const deviceInfo = this.getDeviceInfo();
    const pageUrl = url || window.location.href;
    const pageTitle = document.title;
    const referrer = document.referrer;

    const payload: TrackingPayload = {
      pageUrl,
      pageTitle,
      referrer: referrer || undefined,
      userAgent: deviceInfo.userAgent,
      sessionId: this.sessionId,
      screenWidth: deviceInfo.screenWidth,
      screenHeight: deviceInfo.screenHeight,
      language: deviceInfo.language,
      timezone: deviceInfo.timezone,
      utmParams: this.getUtmParams(pageUrl)
    };

    console.log('📄 Tracking page view:', {
      url: pageUrl,
      title: pageTitle,
      referrer: referrer || 'direct',
      sessionId: this.sessionId
    });

    try {
      const startTime = performance.now();
      const response = await fetch(`${this.apiBase}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const duration = Math.round(performance.now() - startTime);

      if (response.ok) {
        this.trackingStats.pageViews++;
        const result = await response.json();
        console.log('✅ Page view tracked successfully:', {
          status: response.status,
          duration: `${duration}ms`,
          totalPageViews: this.trackingStats.pageViews,
          userId: result.userId,
          deviceType: result.deviceType
        });
      } else {
        this.trackingStats.errors++;
        const errorText = await response.text();
        console.warn('❌ Page view tracking failed:', {
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          error: errorText
        });
      }
    } catch (error) {
      this.trackingStats.errors++;
      console.error('❌ Page view tracking error:', error);
    }
  }

  // UPDATED: Track custom events with consent check
  async trackEvent(
    name: string, 
    properties?: {
      category?: string;
      action?: string;
      label?: string;
      value?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    if (typeof window === 'undefined' || !this.isEnabled) return;

    // Check consent before tracking
    if (!this.checkConsent()) return;

    // Update activity timestamp
    this.updateActivity();

    const payload: EventPayload = {
      sessionId: this.sessionId,
      eventName: name,
      eventCategory: properties?.category,
      eventAction: properties?.action,
      eventLabel: properties?.label,
      eventValue: properties?.value,
      pageUrl: window.location.href,
      metadata: properties?.metadata,
    };

    console.log('🎯 Tracking event:', {
      name,
      category: properties?.category,
      action: properties?.action,
      label: properties?.label,
      value: properties?.value
    });

    try {
      const startTime = performance.now();
      const response = await fetch(`${this.apiBase}/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const duration = Math.round(performance.now() - startTime);

      if (response.ok) {
        this.trackingStats.events++;
        console.log('✅ Event tracked successfully:', {
          event: name,
          duration: `${duration}ms`,
          totalEvents: this.trackingStats.events
        });
      } else {
        this.trackingStats.errors++;
        const errorText = await response.text();
        console.warn('❌ Event tracking failed:', {
          event: name,
          status: response.status,
          duration: `${duration}ms`,
          error: errorText
        });
      }
    } catch (error) {
      this.trackingStats.errors++;
      console.error('❌ Event tracking error:', error);
    }
  }

  // UPDATED: Track performance metrics with consent check
  async trackPerformance(metrics: PerformanceMetric[]): Promise<void> {
    if (typeof window === 'undefined' || !this.isEnabled) return;

    // Check consent before tracking
    if (!this.checkConsent()) return;

    this.updateActivity();

    const payload = {
      sessionId: this.sessionId,
      pageUrl: window.location.href,
      metrics: metrics,
    };

    console.log('⚡ Tracking performance metrics:', metrics);

    try {
      const response = await fetch(`${this.apiBase}/performance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        this.trackingStats.performance++;
        console.log('✅ Performance metrics tracked:', {
          count: metrics.length,
          types: metrics.map(m => m.type),
          totalPerformanceEvents: this.trackingStats.performance
        });
      } else {
        this.trackingStats.errors++;
        console.warn('❌ Performance tracking failed:', response.status);
      }
    } catch (error) {
      this.trackingStats.errors++;
      console.error('❌ Performance tracking error:', error);
    }
  }

  // UPDATED: Track Web Vitals with consent check
  async trackWebVitals(): Promise<void> {
    if (typeof window === 'undefined' || !this.isEnabled) return;

    // Check consent before setting up Web Vitals tracking
    if (!CookieConsentManager.isAnalyticsAllowed()) {
      console.log('🍪 Web Vitals tracking blocked - no consent');
      return;
    }

    try {
      console.log('🔄 Loading Web Vitals library...');
      const webVitals = await import('web-vitals');

      // Check if functions exist before calling
      if (webVitals.getCLS) {
        webVitals.getCLS((metric) => {
          if (this.checkConsent()) {
            console.log('📊 CLS metric:', metric.value);
            this.trackPerformance([{ type: 'CLS', value: metric.value }]);
          }
        });
      }

      if (webVitals.getFID) {
        webVitals.getFID((metric) => {
          if (this.checkConsent()) {
            console.log('📊 FID metric:', metric.value);
            this.trackPerformance([{ type: 'FID', value: metric.value }]);
          }
        });
      }

      if (webVitals.getLCP) {
        webVitals.getLCP((metric) => {
          if (this.checkConsent()) {
            console.log('📊 LCP metric:', metric.value);
            this.trackPerformance([{ type: 'LCP', value: metric.value }]);
          }
        });
      }

      if (webVitals.getTTFB) {
        webVitals.getTTFB((metric) => {
          if (this.checkConsent()) {
            console.log('📊 TTFB metric:', metric.value);
            this.trackPerformance([{ type: 'TTFB', value: metric.value }]);
          }
        });
      }

      console.log('✅ Web Vitals tracking initialized with consent checks');

    } catch (error) {
      console.info('ℹ️ Web Vitals not available - skipping performance tracking');
    }
  }

  // UPDATED: Initialize with consent monitoring
  init(): void {
    if (typeof window === 'undefined' || this.isInitialized) return;

    console.log('🚀 Initializing analytics tracking with consent monitoring...');
    this.isInitialized = true;

    // Start monitoring consent status
    this.startConsentMonitoring();

    // Only proceed with tracking setup if consent is already given
    if (CookieConsentManager.isAnalyticsAllowed()) {
      this.setupTracking();
    } else {
      console.log('🍪 Analytics initialization deferred - awaiting consent');
    }
  }

  // NEW: Start monitoring consent status
  private startConsentMonitoring(): void {
    // Check consent every 2 seconds to detect changes
    this.consentCheckInterval = setInterval(() => {
      const hasConsent = CookieConsentManager.isAnalyticsAllowed();
      
      if (hasConsent && !this.isTrackingActive()) {
        console.log('✅ Consent granted - activating analytics');
        this.setupTracking();
        this.reinitializeSession();
      } else if (!hasConsent && this.isTrackingActive()) {
        console.log('🚫 Consent revoked - deactivating analytics');
        this.deactivateTracking();
      }
    }, 2000);

    // Also listen for storage changes (consent updates from other tabs)
    window.addEventListener('storage', (e) => {
      if (e.key?.includes('cookie_')) {
        const hasConsent = CookieConsentManager.isAnalyticsAllowed();
        if (!hasConsent) {
          this.deactivateTracking();
        } else if (!this.isTrackingActive()) {
          this.setupTracking();
          this.reinitializeSession();
        }
      }
    });
  }

  // NEW: Check if tracking is currently active
  private isTrackingActive(): boolean {
    return this.isEnabled && CookieConsentManager.isAnalyticsAllowed();
  }

  // NEW: Setup all tracking functionality
  private setupTracking(): void {
    console.log('🔧 Setting up analytics tracking...');

    // Track initial page view
    this.trackPageView();

    // Track Web Vitals
    this.trackWebVitals();

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.checkConsent()) {
        console.log('👋 Page hidden - tracking exit');
        this.trackEvent('page_exit', {
          category: 'engagement',
          action: 'page_visibility',
          label: 'hidden'
        });
      }
    });

    // Track scroll depth
    let maxScrollDepth = 0;
    const trackScrollDepth = () => {
      if (!this.checkConsent()) return;
      
      const scrollDepth = Math.round(
        (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      );
      
      if (scrollDepth > maxScrollDepth && scrollDepth >= 25) {
        maxScrollDepth = scrollDepth;
        
        if (scrollDepth >= 25 && scrollDepth < 50) {
          console.log('📜 Scroll depth: 25%');
          this.trackEvent('scroll_depth', { category: 'engagement', label: '25%' });
        } else if (scrollDepth >= 50 && scrollDepth < 75) {
          console.log('📜 Scroll depth: 50%');
          this.trackEvent('scroll_depth', { category: 'engagement', label: '50%' });
        } else if (scrollDepth >= 75) {
          console.log('📜 Scroll depth: 75%');
          this.trackEvent('scroll_depth', { category: 'engagement', label: '75%' });
        }
      }
    };

    let scrollTimeout: NodeJS.Timeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(trackScrollDepth, 100);
    });

    // Track time on page
    const startTime = Date.now();
    window.addEventListener('beforeunload', () => {
      if (this.checkConsent()) {
        const timeOnPage = Math.round((Date.now() - startTime) / 1000);
        console.log('⏱️ Time on page:', timeOnPage, 'seconds');
        this.trackEvent('time_on_page', {
          category: 'engagement',
          value: timeOnPage,
          metadata: { seconds: timeOnPage }
        });
      }
    });

    console.log('✅ Analytics tracking setup complete');
  }

  // NEW: Deactivate tracking and clear data
  private deactivateTracking(): void {
    console.log('🛑 Deactivating analytics tracking');
    CookieConsentManager.clearAnalyticsData();
    this.isEnabled = false;
    
    // Clear the session to force regeneration when consent is granted again
    this.sessionId = uuidv4();
  }

  // NEW: Reinitialize session when consent is granted
  private reinitializeSession(): void {
    this.isEnabled = true;
    this.sessionId = this.initSession();
    console.log('🔄 Analytics session reinitialized:', this.sessionId);
  }

  // Get current session ID
  getSessionId(): string {
    return this.sessionId;
  }

  // Manual page view tracking for SPA navigation
  onRouteChange(url: string): void {
    if (this.checkConsent()) {
      console.log('🔄 Route change detected:', url);
      this.trackPageView(url);
    }
  }

  // Get tracking statistics with consent info
  getStats() {
    return {
      ...this.trackingStats,
      isEnabled: this.isEnabled,
      sessionId: this.sessionId,
      consentGranted: CookieConsentManager.isAnalyticsAllowed(),
      consentChecked: true
    };
  }

  // Method to re-enable tracking (called by consent manager)
  enable(): void {
    this.isEnabled = true;
    console.log('✅ Analytics tracking enabled');
  }

  // Method to disable tracking (called by consent manager)
  disable(): void {
    this.isEnabled = false;
    CookieConsentManager.clearAnalyticsData();
    console.log('🚫 Analytics tracking disabled');
  }

  // UPDATED: Debug method with consent status
  async debug(): Promise<void> {
    console.log('🔍 Analytics Debug Report:');
    console.log('Session ID:', this.sessionId);
    console.log('API Base:', this.apiBase);
    console.log('Is Enabled:', this.isEnabled);
    console.log('Is Initialized:', this.isInitialized);
    console.log('Consent Granted:', CookieConsentManager.isAnalyticsAllowed());
    console.log('Tracking Stats:', this.trackingStats);
    console.log('Device Info:', this.getDeviceInfo());
    
    // Check session persistence
    if (typeof window !== 'undefined') {
      console.log('Session Storage:', {
        localStorage: localStorage.getItem('analytics_session_id'),
        sessionStorage: sessionStorage.getItem('analytics_session_id'),
        lastActivity: localStorage.getItem('analytics_last_activity')
      });
    }
    
    // Test API connectivity (only if consent given)
    if (CookieConsentManager.isAnalyticsAllowed()) {
      try {
        console.log('🧪 Testing API connectivity...');
        await this.trackEvent('debug_test', {
          category: 'debug',
          action: 'connectivity_test',
          metadata: { timestamp: Date.now() }
        });
        console.log('✅ API connectivity test passed');
      } catch (error) {
        console.error('❌ API connectivity test failed:', error);
      }
    } else {
      console.log('🍪 API connectivity test skipped - no consent');
    }
  }

  // NEW: Cleanup method
  destroy(): void {
    if (this.consentCheckInterval) {
      clearInterval(this.consentCheckInterval);
      this.consentCheckInterval = null;
    }
  }
}

// Create singleton instance
const analytics = new AnalyticsClient();

// ✅ UPDATED: Global exposure with consent awareness
if (typeof window !== 'undefined') {
  // Expose analytics instance globally
  (window as any).analytics = analytics;
  
  // Add debug methods to window for easy access
  (window as any).analyticsDebug = () => analytics.debug();
  (window as any).analyticsStats = () => console.log(analytics.getStats());
  
  // Add consent-aware test method
  (window as any).analyticsTest = () => {
    if (CookieConsentManager.isAnalyticsAllowed()) {
      console.log('🧪 Testing analytics tracking...');
      analytics.trackEvent('manual_test', {
        category: 'debug',
        action: 'manual_trigger',
        label: 'console_test',
        value: 1,
        metadata: { 
          timestamp: Date.now(),
          source: 'browser_console'
        }
      });
    } else {
      console.log('🍪 Analytics test blocked - no consent given');
    }
  };

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try {
        analytics.init();
        console.log('📊 Analytics ready with consent monitoring! Try: analyticsDebug(), analyticsStats(), or analyticsTest()');
      } catch (error) {
        console.error('Analytics initialization failed:', error);
      }
    });
  } else {
    // DOM is already ready
    setTimeout(() => {
      try {
        analytics.init();
        console.log('📊 Analytics ready with consent monitoring! Try: analyticsDebug(), analyticsStats(), or analyticsTest()');
      } catch (error) {
        console.error('Analytics initialization failed:', error);
      }
    }, 0);
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    analytics.destroy();
  });
}

export default analytics;
export { AnalyticsClient, CookieConsentManager };
export type { PerformanceMetric, DeviceInfo, TrackingPayload, EventPayload, CookiePreferences };