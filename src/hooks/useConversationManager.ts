// hooks/useConversationManager.ts - Comprehensive conversation management
import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRealtimeInsert } from '@/hooks/useRealtimeInsert';
import { useCacheManager, useConversationFetcher } from '@/hooks/useChatDebugActions';
import { storage, CACHE_KEYS, CACHE_EXPIRY } from '@/lib/cookieUtils';

// Types
export interface Participant {
  user_id: string;
  display_name: string;
  avatar_url: string;
  email: string;
  online: boolean;
}

export interface Conversation {
  id: string;
  channel_id: string;
  channel_name: string;
  is_group: boolean;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  participants: Participant[];
}

interface UseConversationManagerOptions {
  userId?: string | null;
  enableRealtime?: boolean;
  enableDebug?: boolean;
  onConversationDeleted?: (channelId: string) => void;
}

export function useConversationManager(options: UseConversationManagerOptions = {}) {
  const { userId, enableRealtime = true, enableDebug = false, onConversationDeleted } = options;
  
  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasLoadedFromCache, setHasLoadedFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs
  const isMounted = useRef(true);
  
  // Hooks
  const cacheManager = useCacheManager(userId);
  const fetcher = useConversationFetcher(userId);
  
  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Load conversations from cache on mount
  useEffect(() => {
    if (!userId) return;
    
    cacheManager.addDebugLog('🚀 Loading initial conversations from cache');
    const cachedConversations = cacheManager.loadFromCache(userId);
    
    if (cachedConversations.length > 0) {
      setConversations(cachedConversations);
      setHasLoadedFromCache(true);
      cacheManager.addDebugLog(`✅ Loaded ${cachedConversations.length} conversations from cache`);
    }
  }, [userId]);

  // Fetch conversations when user is ready
  useEffect(() => {
    if (userId && !fetcher.hasFetched) {
      cacheManager.addDebugLog('🌐 Triggering initial fetch');
      handleFetch();
    }
  }, [userId]);

  // Enhanced fetch handler
  const handleFetch = useCallback(async (forceRefresh = false) => {
    if (!userId) {
      cacheManager.addDebugLog('❌ Cannot fetch: no user ID');
      return;
    }

    try {
      const result = await fetcher.fetchConversations(forceRefresh);
      
      if (result && isMounted.current) {
        setConversations(result);
        setHasLoadedFromCache(true);
        setError(null);
        cacheManager.addDebugLog(`✅ Fetch successful: ${result.length} conversations`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch conversations';
      cacheManager.addDebugLog(`❌ Fetch failed: ${errorMessage}`);
      
      // Only set error if we don't have cached data
      if (!hasLoadedFromCache || conversations.length === 0) {
        setError(errorMessage);
      }
    }
  }, [userId, fetcher, hasLoadedFromCache, conversations.length, isMounted, cacheManager]);

  // Realtime message handling
  useRealtimeInsert({
    supabase,
    table: 'messages',
    enabled: enableRealtime && !!userId,
    onInsert: (newMessage: any) => {
      if (!newMessage?.channel_id || !isMounted.current || !userId) return;
      
      cacheManager.addDebugLog(`📨 Realtime message for channel: ${newMessage.channel_id.slice(-4)}`);
      
      setConversations(prev => {
        const idx = prev.findIndex(c => c.channel_id === newMessage.channel_id);
        
        if (idx === -1) {
          cacheManager.addDebugLog('🔄 Unknown channel, triggering refresh');
          setTimeout(() => handleFetch(true), 1000);
          return prev;
        }
        
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.last_message = newMessage.content;
        conv.last_message_at = newMessage.created_at;
        
        // Only increment unread if it's not from current user
        if (newMessage.sender_id !== userId) {
          conv.unread_count = (conv.unread_count || 0) + 1;
        }
        
        // Move conversation to top
        updated.splice(idx, 1);
        updated.unshift(conv);
        
        // Save to cache immediately
        cacheManager.saveToCache(updated, userId);
        
        return updated;
      });
    }
  });

  // Add new conversation
  const addConversation = useCallback((conversation: Conversation) => {
    if (!userId) {
      cacheManager.addDebugLog('❌ Cannot add conversation: no user ID');
      return;
    }
    
    cacheManager.addDebugLog(`➕ Adding conversation: ${conversation.channel_name}`);
    
    setConversations(prev => {
      const exists = prev.some(c => c.channel_id === conversation.channel_id);
      if (exists) {
        cacheManager.addDebugLog('⚠️ Conversation already exists');
        return prev;
      }
      
      const updated = [conversation, ...prev];
      cacheManager.saveToCache(updated, userId);
      setHasLoadedFromCache(true);
      
      cacheManager.addDebugLog(`✅ Added successfully, total: ${updated.length}`);
      return updated;
    });
    
    // Refresh to get latest server data
    setTimeout(() => handleFetch(true), 1000);
  }, [userId, cacheManager, handleFetch]);

  // Remove conversation
  const removeConversation = useCallback((channelId: string) => {
    if (!userId) {
      cacheManager.addDebugLog('❌ Cannot remove conversation: no user ID');
      return;
    }
    
    cacheManager.addDebugLog(`🗑️ Removing conversation: ${channelId.slice(-4)}`);
    
    setConversations(prev => {
      const updated = prev.filter(conv => conv.channel_id !== channelId);
      cacheManager.saveToCache(updated, userId);
      
      // Clean up related caches
      storage.remove(CACHE_KEYS.USER_MESSAGES(userId, channelId));
      
      cacheManager.addDebugLog(`✅ Removed successfully, remaining: ${updated.length}`);
      return updated;
    });
    
    // Notify parent
    if (onConversationDeleted) {
      onConversationDeleted(channelId);
    }
  }, [userId, cacheManager, onConversationDeleted]);

  // Mark conversation as read
  const markAsRead = useCallback((channelId: string) => {
    if (!userId) return;
    
    cacheManager.addDebugLog(`✅ Marking as read: ${channelId.slice(-4)}`);
    
    setConversations(prev => {
      const updated = prev.map(c => 
        c.channel_id === channelId 
          ? { ...c, unread_count: 0 }
          : c
      );
      
      cacheManager.saveToCache(updated, userId);
      return updated;
    });
  }, [userId, cacheManager]);

  // Search conversations
  const searchConversations = useCallback((query: string): Conversation[] => {
    if (!query.trim()) return conversations;
    
    const searchTerm = query.toLowerCase();
    return conversations.filter(conv =>
      conv.channel_name.toLowerCase().includes(searchTerm) ||
      conv.participants.some(p => 
        p.display_name?.toLowerCase().includes(searchTerm) ||
        p.email?.toLowerCase().includes(searchTerm)
      )
    );
  }, [conversations]);

  // Update conversation
  const updateConversation = useCallback((channelId: string, updates: Partial<Conversation>) => {
    if (!userId) return;
    
    cacheManager.addDebugLog(`📝 Updating conversation: ${channelId.slice(-4)}`);
    
    setConversations(prev => {
      const updated = prev.map(c => 
        c.channel_id === channelId 
          ? { ...c, ...updates }
          : c
      );
      
      cacheManager.saveToCache(updated, userId);
      return updated;
    });
  }, [userId, cacheManager]);

  // Get conversation by ID
  const getConversation = useCallback((channelId: string): Conversation | null => {
    return conversations.find(c => c.channel_id === channelId) || null;
  }, [conversations]);

  // Force refresh
  const refresh = useCallback(() => {
    cacheManager.addDebugLog('🔄 Force refresh triggered');
    return handleFetch(true);
  }, [handleFetch, cacheManager]);

  // Clear all data and restart
  const reset = useCallback(() => {
    cacheManager.addDebugLog('🔄 Reset triggered');
    
    // Clear state
    setConversations([]);
    setHasLoadedFromCache(false);
    setError(null);
    
    // Clear cache
    cacheManager.clearCache(userId, ['conversations']);
    
    // Fetch fresh data
    if (userId) {
      setTimeout(() => handleFetch(true), 100);
    }
  }, [userId, cacheManager, handleFetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Debug actions (only in development)
  const debugActions = enableDebug ? {
    clearCache: () => cacheManager.clearCache(userId, ['all']),
    cleanupCache: () => cacheManager.cleanupCache(),
    showDebugInfo: () => cacheManager.showDebugInfo(),
    forceRefresh: () => refresh(),
    logState: () => {
      console.log('[ConversationManager] Current State:', {
        conversations: conversations.length,
        hasLoadedFromCache,
        isLoading: fetcher.isLoading,
        error,
        userId: userId?.slice(-4)
      });
    }
  } : {};

  return {
    // State
    conversations,
    isLoading: fetcher.isLoading && !hasLoadedFromCache,
    hasLoadedFromCache,
    error: error || fetcher.error,
    
    // Actions
    addConversation,
    removeConversation,
    markAsRead,
    updateConversation,
    searchConversations,
    getConversation,
    refresh,
    reset,
    
    // Cache & Debug
    cacheInfo: cacheManager.cacheInfo,
    debugLog: cacheManager.debugLog,
    ...debugActions
  };
}

// Simplified hook for basic conversation list
export function useConversationList(userId?: string | null, enableRealtime = true) {
  const manager = useConversationManager({ 
    userId, 
    enableRealtime,
    enableDebug: process.env.NODE_ENV === 'development'
  });
  
  return {
    conversations: manager.conversations,
    isLoading: manager.isLoading,
    error: manager.error,
    refresh: manager.refresh,
    search: manager.searchConversations
  };
}

// Hook for conversation actions
export function useConversationActions(userId?: string | null) {
  const manager = useConversationManager({ userId });
  
  return {
    addConversation: manager.addConversation,
    removeConversation: manager.removeConversation,
    markAsRead: manager.markAsRead,
    updateConversation: manager.updateConversation,
    getConversation: manager.getConversation
  };
}