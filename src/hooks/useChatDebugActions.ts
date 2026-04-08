// hooks/useChatDebugActions.ts - FIXED to work exactly like your original implementation
import { useCallback, useRef } from 'react';
import { storage, CACHE_KEYS, CACHE_EXPIRY } from '@/lib/cookieUtils';

// Debug logger hook that manages its own state exactly like your original
export function useDebugLogger(componentName: string = 'Component') {
  const debugLogRef = useRef<string[]>([]);
  
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${message}`;
    console.log(`[${componentName}] ${logEntry}`);
    
    // Keep last 10 entries exactly like your original
    debugLogRef.current = [...debugLogRef.current.slice(-9), logEntry];
  }, [componentName]);

  const getLogs = useCallback(() => debugLogRef.current, []);
  
  const clearLogs = useCallback(() => {
    debugLogRef.current = [];
    addDebugLog('🗑️ Debug logs cleared');
  }, [addDebugLog]);

  return {
    addDebugLog,
    getLogs,
    clearLogs,
    debugLog: debugLogRef.current
  };
}

// Cache manager that works exactly like your storage calls
export function useCacheManager(userId: string | null, componentName: string = 'Component') {
  const { addDebugLog } = useDebugLogger(componentName);

  const clearUserCache = useCallback(() => {
    if (!userId) {
      addDebugLog('❌ Cannot clear cache: no user ID');
      return false;
    }

    try {
      // Clear exactly like your original handleClearCache
      storage.remove(CACHE_KEYS.USER_CONVERSATIONS(userId));
      storage.remove(CACHE_KEYS.CONVERSATIONS);
      storage.remove(CACHE_KEYS.SELECTED_CHAT);
      storage.cleanup();
      
      addDebugLog(`✅ Cache cleared for user: ${userId.slice(-4)}`);
      return true;
    } catch (err) {
      addDebugLog(`❌ Cache clear error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return false;
    }
  }, [userId, addDebugLog]);

  const loadFromCache = useCallback((cacheKey: string, defaultValue: any = null) => {
    if (!userId) {
      addDebugLog('❌ Cannot load from cache: no user ID');
      return defaultValue;
    }

    try {
      // Use storage.get exactly like your original
      const cached = storage.get(cacheKey, defaultValue, userId);
      if (cached && cached !== defaultValue) {
        addDebugLog(`✅ Loaded from cache: ${cacheKey}`);
        return cached;
      } else {
        addDebugLog(`📦 No cache found: ${cacheKey}`);
        return defaultValue;
      }
    } catch (err) {
      addDebugLog(`❌ Cache load error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return defaultValue;
    }
  }, [userId, addDebugLog]);

  const saveToCache = useCallback((cacheKey: string, data: any, expiry: number = CACHE_EXPIRY.MEDIUM) => {
    if (!userId) {
      addDebugLog('❌ Cannot save to cache: no user ID');
      return false;
    }

    try {
      // Use storage.set exactly like your original
      storage.set(cacheKey, data, expiry, userId);
      addDebugLog(`✅ Saved to cache: ${cacheKey} (${Array.isArray(data) ? data.length : typeof data} items)`);
      return true;
    } catch (err) {
      addDebugLog(`❌ Cache save error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return false;
    }
  }, [userId, addDebugLog]);

  const cleanupExpiredCache = useCallback(() => {
    try {
      storage.cleanup();
      addDebugLog(`✅ Cache cleanup completed`);
      return { removed: 'unknown' }; // storage.cleanup doesn't return count in your implementation
    } catch (err) {
      addDebugLog(`❌ Cache cleanup error: ${err instanceof Error ? err.message : 'Unknown'}`);
      return { removed: 0, errors: 1 };
    }
  }, [addDebugLog]);

  return {
    clearUserCache,
    loadFromCache,
    saveToCache,
    cleanupExpiredCache,
    addDebugLog
  };
}

// Main debug actions hook that mirrors your exact button functions
interface UseChatDebugActionsProps {
  currentUserId: string | null;
  setConversations: React.Dispatch<React.SetStateAction<any[]>>;
  setHasLoadedFromCache: React.Dispatch<React.SetStateAction<boolean>>;
  setCacheInfo: React.Dispatch<React.SetStateAction<string>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  hasFetched: React.MutableRefObject<boolean>;
  lastFetchTime: React.MutableRefObject<number>;
  addDebugLog: (message: string) => void;
  debugLog: string[];
  setDebugLog?: React.Dispatch<React.SetStateAction<string[]>>;
  fetchFunction: (forceRefresh?: boolean) => Promise<void>;
}

export function useChatDebugActions({
  currentUserId,
  setConversations,
  setHasLoadedFromCache,
  setCacheInfo,
  setIsLoading,
  hasFetched,
  lastFetchTime,
  addDebugLog,
  debugLog,
  fetchFunction
}: UseChatDebugActionsProps) {

  // Debug cache function - exactly like your handleDebugCache
  const debugCache = useCallback(() => {
    if (!currentUserId) return;
    
    const debugInfo = {
      currentUser: storage.get(CACHE_KEYS.CURRENT_USER),
      userConversations: storage.get(CACHE_KEYS.USER_CONVERSATIONS(currentUserId)),
      genericConversations: storage.get(CACHE_KEYS.CONVERSATIONS),
      selectedChat: storage.get(CACHE_KEYS.SELECTED_CHAT),
      storageDebug: storage.debug(CACHE_KEYS.USER_CONVERSATIONS(currentUserId))
    };
    
    console.log('[ChatSidebar] 🐛 Cache Debug Info:', debugInfo);
    alert(`Cache Debug Info (see console):\n\nUser Conversations: ${debugInfo.userConversations?.length || 0}\nGeneric Conversations: ${debugInfo.genericConversations?.length || 0}\nSelected Chat: ${debugInfo.selectedChat?.channel_name || 'None'}\n\nLogs:\n${debugLog.slice(-5).join('\n')}`);
  }, [currentUserId, debugLog]);

  // Clear cache function - exactly like your handleClearCache
  const clearCache = useCallback(() => {
    if (!currentUserId) return;
    
    storage.remove(CACHE_KEYS.USER_CONVERSATIONS(currentUserId));
    storage.remove(CACHE_KEYS.CONVERSATIONS);
    storage.remove(CACHE_KEYS.SELECTED_CHAT);
    storage.cleanup();
    
    setConversations([]);
    setHasLoadedFromCache(false);
    setCacheInfo('Cache cleared');
    setIsLoading(true);
    hasFetched.current = false;
    lastFetchTime.current = 0;
    
    addDebugLog('🗑️ Cache cleared, forcing refresh');
    setTimeout(() => fetchFunction(true), 100);
  }, [
    currentUserId,
    setConversations,
    setHasLoadedFromCache,
    setCacheInfo,
    setIsLoading,
    hasFetched,
    lastFetchTime,
    addDebugLog,
    fetchFunction
  ]);

  // Cleanup function - exactly like your cleanup button
  const cleanup = useCallback(() => {
    storage.cleanup();
    setCacheInfo('Cleanup completed');
    addDebugLog('🧹 Manual cleanup completed');
  }, [setCacheInfo, addDebugLog]);

  // Force fetch function - exactly like your fetch button
  const forceFetch = useCallback(() => {
    addDebugLog('🔄 Manual fetch triggered');
    fetchFunction(true);
  }, [addDebugLog, fetchFunction]);

  const clearLogs = useCallback(() => {
    addDebugLog('🗑️ Debug logs cleared');
  }, [addDebugLog]);

  return {
    clearCache,
    cleanup,
    forceFetch,
    debugCache,
    clearLogs
  };
}