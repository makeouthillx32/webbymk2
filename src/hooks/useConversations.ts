// hooks/useConversations.ts - Conversation management hook
import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRealtimeInsert } from '@/hooks/useRealtimeInsert';
import { storage, CACHE_KEYS } from '@/lib/cookieUtils';
import type { Conversation } from '@/app/dashboard/[id]/messages/_components/ChatSidebar';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UseConversationsOptions {
  onConversationDeleted?: (channelId: string) => void;
}

export function useConversations(options: UseConversationsOptions = {}) {
  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  // Refs for lifecycle management
  const isMounted = useRef(true);
  const lastFetchTime = useRef(0);
  const hasFetched = useRef(false);

  // Initialize current user
  useEffect(() => {
    const initializeUser = async () => {
      try {
        console.log('[useConversations] 🔍 Initializing user...');
        
        const cachedUser = storage.get(CACHE_KEYS.CURRENT_USER);
        if (cachedUser?.id) {
          setCurrentUserId(cachedUser.id);
          console.log('[useConversations] ✅ Using cached user:', cachedUser.id);
          return;
        }

        const { data, error } = await supabase.auth.getUser();
        if (!isMounted.current) return;
        
        if (error) {
          console.error('[useConversations] ❌ Auth error:', error);
          return;
        }
        
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
          storage.set(CACHE_KEYS.CURRENT_USER, data.user, 3600);
          console.log('[useConversations] ✅ User authenticated:', data.user.id);
        }
      } catch (err) {
        console.error('[useConversations] ❌ Error initializing user:', err);
      }
    };

    initializeUser();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Fetch conversations from API - NO useCallback to avoid dependency issues
  const fetchConversations = async (forceRefresh = false) => {
    console.log('[useConversations] 🔄 fetchConversations called', { forceRefresh, hasFetched: hasFetched.current });
    
    if (!forceRefresh && hasFetched.current && Date.now() - lastFetchTime.current < 30000) {
      console.log('[useConversations] ⏭️ Skipping fetch (too recent)');
      return;
    }

    const cachedData = storage.get(CACHE_KEYS.CONVERSATIONS);
    if (!forceRefresh && cachedData && !hasFetched.current) {
      console.log('[useConversations] 💾 Using cached conversations:', cachedData.length);
      setConversations(cachedData);
      setIsLoading(false);
      return;
    }

    try {
      hasFetched.current = true;
      lastFetchTime.current = Date.now();
      if (!cachedData || forceRefresh) setIsLoading(true);

      console.log('[useConversations] 🌐 Fetching conversations from server');

      const res = await fetch('/api/messages/get-conversations');
      if (!isMounted.current) return;
      
      console.log('[useConversations] 📡 API Response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[useConversations] ❌ API Error:', res.status, errorText);
        throw new Error(`Failed to fetch conversations: ${res.status}`);
      }

      const raw = await res.json();
      console.log('[useConversations] 📦 Raw API data:', raw);
      
      const mapped: Conversation[] = raw.map((c: any) => ({
        id: c.id ?? c.channel_id,
        channel_id: c.channel_id,
        channel_name: c.channel_name,
        is_group: c.is_group,
        last_message: c.last_message_content ?? null,
        last_message_at: c.last_message_at ?? null,
        unread_count: c.unread_count ?? 0,
        participants: (c.participants || []).map((p: any) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          email: p.email,
          online: p.online ?? false,
        })),
      }));

      if (!isMounted.current) return;

      console.log('[useConversations] ✅ Mapped conversations:', mapped.length);
      storage.set(CACHE_KEYS.CONVERSATIONS, mapped, 300);
      setConversations(mapped);
      setError(null);

    } catch (err) {
      console.error('[useConversations] ❌ Error fetching conversations:', err);
      if (!cachedData || forceRefresh) {
        setError("Failed to load conversations. Please try again.");
      }
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  // Initial fetch when component mounts - FIXED: No dependency array issues
  useEffect(() => {
    console.log('[useConversations] 🚀 Hook mounted, starting initial fetch');
    fetchConversations();
  }, []); // Empty dependency array

  // Listen for new messages to update conversation list
  useRealtimeInsert({
    supabase,
    table: 'messages',
    enabled: true,
    onInsert: (newMessage: any) => {
      if (!newMessage?.channel_id || !isMounted.current) return;
      
      console.log('[useConversations] 📨 New message received, updating conversation:', newMessage.channel_id);
      
      setConversations(prev => {
        const idx = prev.findIndex(c => c.channel_id === newMessage.channel_id);
        if (idx === -1) {
          console.log('[useConversations] 🔄 Message for unknown channel, triggering refresh');
          setTimeout(() => fetchConversations(true), 1000);
          return prev;
        }
        
        const updated = [...prev];
        const conv = { ...updated[idx] };
        conv.last_message = newMessage.content;
        conv.last_message_at = newMessage.created_at;
        
        // Only increment unread if it's not from current user
        if (newMessage.sender_id !== currentUserId) {
          conv.unread_count = (conv.unread_count || 0) + 1;
        }
        
        // Move conversation to top
        updated.splice(idx, 1);
        updated.unshift(conv);
        
        // Update cache
        storage.set(CACHE_KEYS.CONVERSATIONS, updated, 300);
        return updated;
      });
    }
  });

  // Add new conversation
  const addConversation = useCallback((conversation: Conversation) => {
    console.log('[useConversations] ➕ Adding new conversation:', conversation);
    
    setConversations(prev => {
      const exists = prev.some(c => c.channel_id === conversation.channel_id);
      if (exists) return prev;
      
      const updated = [conversation, ...prev];
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, 300);
      return updated;
    });
    
    // Refresh to get latest server data
    setTimeout(() => fetchConversations(true), 1000);
  }, []);

  // Remove conversation
  const removeConversation = useCallback((channelId: string) => {
    console.log('[useConversations] 🗑️ Removing conversation:', channelId);
    
    setConversations(prev => {
      const updated = prev.filter(conv => conv.channel_id !== channelId);
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, 300);
      return updated;
    });
    
    // Notify parent component
    if (options.onConversationDeleted) {
      options.onConversationDeleted(channelId);
    }
  }, [options]);

  // Mark conversation as read
  const markAsRead = useCallback((channelId: string) => {
    setConversations(prev => {
      const updated = prev.map(c => 
        c.channel_id === channelId 
          ? { ...c, unread_count: 0 }
          : c
      );
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, 300);
      return updated;
    });
  }, []);

  return {
    // State
    conversations,
    isLoading,
    error,
    currentUserId,
    
    // Actions
    fetchConversations,
    addConversation,
    removeConversation,
    markAsRead,
    
    // Utils
    refreshConversations: () => fetchConversations(true)
  };
}