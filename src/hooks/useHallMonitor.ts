// hooks/useHallMonitor.ts - UPDATED TO WORK WITH API-BASED FACTORY
import { useState, useEffect, useRef, useCallback } from 'react';
import { hallMonitorFactory } from '@/lib/monitors/HallMonitorFactory';
import type { 
  MonitorUser, 
  HallMonitor, 
  ContentConfig, 
  AccessContext,
  UseHallMonitorResult
} from '@/types/monitors';

export function useHallMonitor(userId?: string): UseHallMonitorResult {
  // State
  const [user, setUser] = useState<MonitorUser | null>(null);
  const [monitor, setMonitor] = useState<HallMonitor | null>(null);
  const [contentConfig, setContentConfig] = useState<ContentConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup and state management
  const isMounted = useRef(true);
  const currentUserId = useRef<string | undefined>(undefined);
  const isCurrentlyLoading = useRef(false);

  // ✅ ENHANCED: Loading function optimized for API-based factory
  const loadUserData = useCallback(async (targetUserId: string) => {
    // Prevent duplicate calls
    if (isCurrentlyLoading.current) {
      console.log('[useHallMonitor] ⏭️ Already loading, skipping duplicate call');
      return;
    }

    // Check if we already have complete data for this user
    if (currentUserId.current === targetUserId && user && monitor && contentConfig) {
      console.log('[useHallMonitor] ⏭️ Complete data already loaded for user:', targetUserId.substring(0, 8));
      return;
    }

    console.log('[useHallMonitor] 🔄 Loading user data via APIs for:', targetUserId.substring(0, 8));
    
    try {
      isCurrentlyLoading.current = true;
      setIsLoading(true);
      setError(null);

      // ✅ Get monitor and user data from factory (now using your APIs)
      console.log('[useHallMonitor] 📡 Calling factory.getMonitorForUser...');
      const result = await hallMonitorFactory.getMonitorForUser(targetUserId);
      
      // Check if component was unmounted during async operation
      if (!isMounted.current) {
        console.log('[useHallMonitor] Component unmounted during load, aborting');
        return;
      }

      console.log('[useHallMonitor] ✅ Factory returned data:', {
        hasUser: !!result.user,
        hasMonitor: !!result.monitor,
        userRole: result.user?.role_name,
        userEmail: result.user?.email ? '[PROVIDED]' : '[MISSING]'
      });

      // ✅ Validate we got valid data
      if (!result.user || !result.monitor) {
        throw new Error('Factory returned incomplete data');
      }

      // Set user and monitor immediately
      setUser(result.user);
      setMonitor(result.monitor);
      currentUserId.current = targetUserId;

      // ✅ Get content config with robust fallback
      let config: ContentConfig;
      try {
        console.log('[useHallMonitor] 📋 Getting content config for role:', result.user.role_name);
        config = await result.monitor.getContentConfig(targetUserId);
        console.log('[useHallMonitor] ✅ Content config received for role:', result.user.role_name);
      } catch (configError) {
        console.warn('[useHallMonitor] ⚠️ Config error, using fallback:', configError);
        
        // ✅ Role-specific fallback configs
        config = getFallbackConfig(result.user.role_name);
      }

      // Final state update
      if (isMounted.current) {
        setContentConfig(config);
        setError(null);
        console.log('[useHallMonitor] 🎉 Successfully loaded complete data for:', targetUserId.substring(0, 8));
      }

    } catch (err) {
      console.error('[useHallMonitor] ❌ Loading error:', err);
      
      if (isMounted.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load user data via APIs';
        setError(errorMessage);
        
        // Clear incomplete state
        setUser(null);
        setMonitor(null);
        setContentConfig(null);
        currentUserId.current = undefined;
      }
    } finally {
      // ✅ Always clear loading state
      if (isMounted.current) {
        setIsLoading(false);
        console.log('[useHallMonitor] ✅ Loading complete, isLoading set to false');
      }
      isCurrentlyLoading.current = false;
    }
  }, []); // No dependencies to prevent recreation

  // ✅ Effect to handle userId changes - optimized
  useEffect(() => {
    console.log('[useHallMonitor] Effect triggered with userId:', userId?.substring(0, 8) || 'undefined');

    // Reset everything if no userId
    if (!userId) {
      console.log('[useHallMonitor] No userId provided, resetting all state');
      setUser(null);
      setMonitor(null);
      setContentConfig(null);
      setIsLoading(false);
      setError(null);
      currentUserId.current = undefined;
      isCurrentlyLoading.current = false;
      return;
    }

    // Determine if we need to load data
    const hasCompleteData = user && monitor && contentConfig;
    const userIdChanged = currentUserId.current !== userId;
    const needsLoading = userIdChanged || !hasCompleteData;
    
    if (needsLoading) {
      console.log('[useHallMonitor] 🚀 Need to load data:', {
        userIdChanged,
        hasCompleteData,
        currentUser: currentUserId.current?.substring(0, 8),
        newUser: userId.substring(0, 8)
      });
      loadUserData(userId);
    } else {
      console.log('[useHallMonitor] ✅ Data already available and current for:', userId.substring(0, 8));
    }
  }, [userId, loadUserData]);

  // ✅ Cleanup effect
  useEffect(() => {
    return () => {
      console.log('[useHallMonitor] 🧹 Component cleanup');
      isMounted.current = false;
    };
  }, []);

  // ✅ Helper functions with stable references
  const canAccess = useCallback(async (
    resource: string, 
    action: string, 
    context?: AccessContext
  ): Promise<boolean> => {
    if (!monitor || !user) {
      console.log('[useHallMonitor] canAccess: No monitor or user available');
      return false;
    }

    try {
      const result = await monitor.checkAccess(user.id, resource, action, context);
      console.log(`[useHallMonitor] Access check result for ${resource}:${action}:`, result.hasAccess);
      return result.hasAccess;
    } catch (err) {
      console.error('[useHallMonitor] Access check error:', err);
      return false;
    }
  }, [monitor, user]);

  const hasFeature = useCallback((feature: string): boolean => {
    const hasIt = contentConfig?.availableFeatures.includes(feature) ?? false;
    console.log(`[useHallMonitor] Feature check for '${feature}':`, hasIt);
    return hasIt;
  }, [contentConfig]);

  const hasSpecialization = useCallback((specialization: string): boolean => {
    const hasIt = user?.specializations?.some(spec => spec.name === specialization) ?? false;
    console.log(`[useHallMonitor] Specialization check for '${specialization}':`, hasIt);
    return hasIt;
  }, [user]);

  const refreshConfig = useCallback(async (): Promise<void> => {
    if (!userId) {
      console.log('[useHallMonitor] Cannot refresh: no userId');
      return;
    }
    
    console.log('[useHallMonitor] 🔄 Refreshing config for:', userId.substring(0, 8));
    
    // Clear cache and reset state
    hallMonitorFactory.clearUserCache(userId);
    currentUserId.current = undefined;
    setUser(null);
    setMonitor(null);
    setContentConfig(null);
    
    // Reload data
    await loadUserData(userId);
  }, [userId, loadUserData]);

  // ✅ Early return with proper fallback for no userId
  if (!userId) {
    return {
      monitor: null,
      user: null,
      contentConfig: null,
      isLoading: false,
      error: null,
      canAccess: async () => false,
      hasFeature: () => false,
      hasSpecialization: () => false,
      refreshConfig: async () => {}
    };
  }

  // ✅ Debug logging for current state (only when relevant)
  const hasCompleteData = !!(user && monitor && contentConfig);
  if (isLoading || !hasCompleteData || error) {
    console.log('[useHallMonitor] 📊 Current state:', {
      userId: userId.substring(0, 8) + '...',
      hasCompleteData,
      isLoading,
      hasError: !!error,
      userRole: user?.role_name,
      errorMessage: error
    });
  }

  return {
    monitor,
    user,
    contentConfig,
    isLoading,
    error,
    canAccess,
    hasFeature,
    hasSpecialization,
    refreshConfig
  };
}

// ✅ FALLBACK CONFIG FUNCTION - Role-specific fallbacks
function getFallbackConfig(roleName: string): ContentConfig {
  console.log('[useHallMonitor] Creating fallback config for role:', roleName);
  
  const baseConfig: ContentConfig = {
    dashboardLayout: 'user-basic' as any,
    availableFeatures: ['profile-view'],
    primaryActions: [],
    secondaryActions: [],
    navigationItems: [
      { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'home' },
      { id: 'profile', label: 'Profile', path: '/profile', icon: 'user' }
    ],
    hiddenSections: [],
    customFields: {},
    visibleComponents: ['header', 'sidebar', 'main-content'],
    permissions: ['profile:read_own']
  };

  // Customize based on role
  switch (roleName) {
    case 'admin':
      return {
        ...baseConfig,
        dashboardLayout: 'admin-content' as any,
        availableFeatures: ['user-management', 'content-editor', 'system-settings'],
        primaryActions: ['manage-users', 'system-config'],
        permissions: ['admin:*']
      };
      
    case 'jobcoach':
      return {
        ...baseConfig,
        dashboardLayout: 'jobcoach-counselor' as any,
        availableFeatures: ['client-profiles', 'session-scheduler'],
        primaryActions: ['schedule-session', 'manage-clients'],
        permissions: ['coach:*', 'client:read']
      };
      
    case 'client':
      return {
        ...baseConfig,
        dashboardLayout: 'client-seeker' as any,
        availableFeatures: ['profile-editor', 'job-applications'],
        primaryActions: ['update-profile', 'book-session'],
        permissions: ['profile:read_own', 'profile:update_own']
      };
      
    default:
      return baseConfig;
  }
}

export default useHallMonitor;