// app/dashboard/[id]/messages/_components/ChatSidebar.tsx (CLEAN - NO DEBUG UI)
'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { createBrowserClient } from '@supabase/ssr';
import NewChatModal from './NewChatModal';
import ChatSidebarHeader from './ChatSidebarHeader';
import ChatSidebarSearch from './ChatSidebarSearch';
import ConversationList from './ConversationList';
import { 
  useChatDebugActions, 
  useDebugLogger,
  useCacheManager 
} from '@/hooks/useChatDebugActions';
import { storage, CACHE_KEYS, CACHE_EXPIRY } from '@/lib/cookieUtils';
import './ChatSidebar.scss';

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

interface ChatSidebarProps {
  selectedChat: Conversation | null;
  onSelectChat: (chat: Conversation) => void;
  onConversationDeleted?: (channelId: string) => void;
  className?: string;
}

export default function ChatSidebar({ 
  selectedChat, 
  onSelectChat,
  onConversationDeleted,
  className = ""
}: ChatSidebarProps) {
  // Internal state - ChatSidebar manages its own conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasLoadedFromCache, setHasLoadedFromCache] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<string>('Initializing...');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  
  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Refs for lifecycle management
  const isMounted = useRef(true);
  const lastFetchTime = useRef(0);
  const hasFetched = useRef(false);
  
  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Initialize hooks for backend automation
  const { addDebugLog: hookAddDebugLog } = useDebugLogger('ChatSidebar');
  
  // Silent debug logging (no UI state updates)
  const addDebugLog = (message: string) => {
    console.log(`[ChatSidebar] ${message}`);
    hookAddDebugLog(message);
  };

  // Enhanced fetch with mounting checks
  const fetchConversations = async (forceRefresh = false) => {
    // Early exit if component is unmounted
    if (!isMounted.current) {
      console.log('[ChatSidebar] ❌ Component unmounted, aborting fetch');
      return;
    }
    
    if (!currentUserId) {
      addDebugLog('❌ No user ID, skipping fetch');
      return;
    }
    
    addDebugLog(`🔄 Starting fetch (force: ${forceRefresh})`);
    
    // ALWAYS fetch if we haven't fetched yet (dev server restart scenario)
    if (!hasFetched.current) {
      addDebugLog('🚀 First fetch - bypassing cache checks');
      forceRefresh = true;
    }
    
    // If we have cached data and this isn't forced, don't fetch too frequently
    if (!forceRefresh && hasLoadedFromCache && hasFetched.current && Date.now() - lastFetchTime.current < 30000) {
      addDebugLog('⏭️ Skipping fetch (recent fetch with cache)');
      return;
    }

    try {
      hasFetched.current = true;
      lastFetchTime.current = Date.now();
      
      // Check if still mounted before setting loading
      if (!isMounted.current) {
        addDebugLog('❌ Component unmounted before loading state');
        return;
      }
      
      // Only show loading if we don't have cached data or it's forced
      if (!hasLoadedFromCache || forceRefresh) {
        setIsLoading(true);
        addDebugLog('🔄 Setting loading state');
      }
      setError(null);

      addDebugLog('🌐 Making API request...');

      const res = await fetch('/api/messages/get-conversations', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      // Check mounting status after async operation
      if (!isMounted.current) {
        addDebugLog('❌ Component unmounted during fetch');
        return;
      }
      
      addDebugLog(`📡 API response: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        addDebugLog(`❌ API error: ${res.status} - ${errorText.slice(0, 100)}`);
        
        // Check mounting status again
        if (!isMounted.current) {
          addDebugLog('❌ Component unmounted during error handling');
          return;
        }
        
        // If we have cached data, don't show error to user
        if (hasLoadedFromCache && conversations.length > 0) {
          addDebugLog('📦 Using cache despite API error');
          setCacheInfo(`${cacheInfo} (API failed, using cache)`);
          return;
        }
        
        throw new Error(`Failed to fetch conversations: ${res.status} - ${errorText}`);
      }

      const raw = await res.json();
      addDebugLog(`📦 Raw data received: ${Array.isArray(raw) ? raw.length : 'not array'} items`);
      
      // Check mounting status again
      if (!isMounted.current) {
        addDebugLog('❌ Component unmounted during data processing');
        return;
      }
      
      if (!Array.isArray(raw)) {
        addDebugLog(`❌ Invalid format: ${typeof raw}`);
        
        // If we have cached data, don't fail completely
        if (hasLoadedFromCache && conversations.length > 0) {
          addDebugLog('📦 Using cache despite invalid response');
          return;
        }
        
        throw new Error('Server returned invalid data format');
      }
      
      // Map the raw data to our conversation format
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

      // Final mounting check before updating state
      if (!isMounted.current) {
        addDebugLog('❌ Component unmounted during mapping');
        return;
      }

      addDebugLog(`✅ Mapped ${mapped.length} conversations successfully`);
      
      // Update state
      setConversations(mapped);
      setError(null);
      setHasLoadedFromCache(true);
      
      // Enhanced caching strategy with user-specific keys
      addDebugLog('💾 Caching conversations...');
      storage.set(CACHE_KEYS.USER_CONVERSATIONS(currentUserId), mapped, CACHE_EXPIRY.MEDIUM, currentUserId);
      storage.set(CACHE_KEYS.CONVERSATIONS, mapped, CACHE_EXPIRY.MEDIUM); // Fallback cache
      
      setCacheInfo(`Fresh data: ${mapped.length} items (cached)`);
      addDebugLog(`✅ Fetch completed: ${mapped.length} conversations`);

    } catch (err) {
      addDebugLog(`❌ Fetch error: ${err instanceof Error ? err.message : 'Unknown'}`);
      
      // Only show error if we don't have any cached data AND component is still mounted
      if (isMounted.current && (!hasLoadedFromCache || conversations.length === 0)) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to load conversations: ${errorMessage}`);
      }
    } finally {
      // Final check before clearing loading state
      if (isMounted.current) {
        setIsLoading(false);
        addDebugLog('✅ Loading state cleared');
      }
    }
  };

  // Initialize debug hooks for backend automation
  const { 
    clearCache, 
    cleanup, 
    forceFetch, 
    debugCache,
    clearLogs 
  } = useChatDebugActions({
    currentUserId,
    setConversations,
    setHasLoadedFromCache,
    setCacheInfo,
    setIsLoading,
    hasFetched,
    lastFetchTime,
    addDebugLog,
    debugLog,
    setDebugLog,
    fetchFunction: fetchConversations
  });

  // Load conversations from cache
  const loadConversationsFromCache = (userId: string) => {
    addDebugLog(`📦 Loading cache for user: ${userId.slice(-4)}`);
    
    // Try user-specific cache first
    const userConversations = storage.get(CACHE_KEYS.USER_CONVERSATIONS(userId), [], userId);
    if (userConversations && Array.isArray(userConversations) && userConversations.length > 0) {
      addDebugLog(`✅ Found user cache: ${userConversations.length} conversations`);
      setConversations(userConversations);
      setIsLoading(false);
      setHasLoadedFromCache(true);
      setCacheInfo(`User cache: ${userConversations.length} items`);
      return;
    }
    
    // Fallback to generic cache
    const genericConversations = storage.get(CACHE_KEYS.CONVERSATIONS, []);
    if (genericConversations && Array.isArray(genericConversations) && genericConversations.length > 0) {
      addDebugLog(`✅ Found generic cache: ${genericConversations.length} conversations`);
      setConversations(genericConversations);
      setIsLoading(false);
      setHasLoadedFromCache(true);
      setCacheInfo(`Generic cache: ${genericConversations.length} items`);
      return;
    }
    
    addDebugLog('📦 No cache found, will fetch from server');
    setCacheInfo('No cache found');
  };

  // Initialize current user
  useEffect(() => {
    // Reset mounting flag
    isMounted.current = true;
    
    const initializeUser = async () => {
      try {
        addDebugLog('🔍 Starting user initialization...');
        
        // Try to get cached user first
        const cachedUser = storage.get(CACHE_KEYS.CURRENT_USER);
        if (cachedUser?.id && isMounted.current) {
          setCurrentUserId(cachedUser.id);
          addDebugLog(`✅ Found cached user: ${cachedUser.id.slice(-4)}`);
          
          // Load conversations for this user from cache immediately
          loadConversationsFromCache(cachedUser.id);
          return;
        }

        addDebugLog('🌐 No cached user, fetching from Supabase...');
        
        // If no cached user, get from Supabase
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted.current) {
          addDebugLog('❌ Component unmounted during auth');
          return;
        }
        
        if (error) {
          addDebugLog(`❌ Auth error: ${error.message}`);
          setError(`Authentication failed: ${error.message}`);
          setIsLoading(false);
          return;
        }
        
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
          addDebugLog(`✅ User authenticated: ${data.user.id.slice(-4)}`);
          
          // Cache user with expiry
          storage.set(CACHE_KEYS.CURRENT_USER, data.user, CACHE_EXPIRY.LONG, data.user.id);
          addDebugLog('💾 User cached successfully');
          
          // Load conversations for this user from cache
          loadConversationsFromCache(data.user.id);
        } else {
          addDebugLog('❌ No user found in auth response');
          setError('No authenticated user found');
          setIsLoading(false);
        }
      } catch (err) {
        addDebugLog(`❌ Initialization error: ${err instanceof Error ? err.message : 'Unknown'}`);
        if (isMounted.current) {
          setError('Failed to initialize user session');
          setIsLoading(false);
        }
      }
    };

    initializeUser();
    
    return () => {
      isMounted.current = false;
    };
  }, []); // Empty dependency array - only run once on mount

  // Fetch conversations when user is authenticated
  useEffect(() => {
    if (currentUserId && isMounted.current) {
      addDebugLog('🚀 User ready, triggering fetch');
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        if (isMounted.current) {
          fetchConversations(true); // Force refresh
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [currentUserId]);

  // Conversation management handlers
  const handleNewConversation = (conversation: Conversation) => {
    if (!currentUserId) {
      addDebugLog('❌ Cannot add conversation: no user ID');
      return;
    }
    
    addDebugLog(`➕ Adding conversation: ${conversation.channel_name}`);
    
    setConversations(prev => {
      const exists = prev.some(c => c.channel_id === conversation.channel_id);
      if (exists) {
        addDebugLog('⚠️ Conversation already exists');
        return prev;
      }
      
      const updated = [conversation, ...prev];
      
      // Update enhanced cache immediately
      storage.set(CACHE_KEYS.USER_CONVERSATIONS(currentUserId), updated, CACHE_EXPIRY.MEDIUM, currentUserId);
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, CACHE_EXPIRY.MEDIUM);
      
      setHasLoadedFromCache(true);
      setCacheInfo(`Added new: ${updated.length} items`);
      addDebugLog(`✅ Added successfully, total: ${updated.length}`);
      return updated;
    });
    
    // Select the new conversation
    onSelectChat(conversation);
    
    // Refresh to get latest server data
    setTimeout(() => fetchConversations(true), 1000);
  };

  const handleConversationDeleted = (channelId: string) => {
    if (!currentUserId) {
      addDebugLog('❌ Cannot delete conversation: no user ID');
      return;
    }
    
    addDebugLog(`🗑️ Deleting conversation: ${channelId.slice(-4)}`);
    
    setConversations(prev => {
      const updated = prev.filter(conv => conv.channel_id !== channelId);
      
      // Update enhanced cache immediately
      storage.set(CACHE_KEYS.USER_CONVERSATIONS(currentUserId), updated, CACHE_EXPIRY.MEDIUM, currentUserId);
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, CACHE_EXPIRY.MEDIUM);
      
      // Also clean up any message caches for this channel
      storage.remove(CACHE_KEYS.USER_MESSAGES(currentUserId, channelId));
      
      setCacheInfo(`Deleted: ${updated.length} items`);
      addDebugLog(`✅ Deleted successfully, remaining: ${updated.length}`);
      return updated;
    });
    
    // Notify parent component
    if (onConversationDeleted) {
      onConversationDeleted(channelId);
    }
  };

  const handleChatSelect = (chat: Conversation) => {
    if (!currentUserId) {
      addDebugLog('❌ Cannot select chat: no user ID');
      return;
    }
    
    addDebugLog(`🎯 Chat selected: ${chat.channel_name}`);
    
    // Mark as read (reset unread count)
    setConversations(prev => {
      const updated = prev.map(c => 
        c.channel_id === chat.channel_id 
          ? { ...c, unread_count: 0 }
          : c
      );
      
      // Update enhanced cache immediately
      storage.set(CACHE_KEYS.USER_CONVERSATIONS(currentUserId), updated, CACHE_EXPIRY.MEDIUM, currentUserId);
      storage.set(CACHE_KEYS.CONVERSATIONS, updated, CACHE_EXPIRY.MEDIUM);
      
      return updated;
    });
    
    // Store selected chat in cache for restoration
    storage.set(CACHE_KEYS.SELECTED_CHAT, chat, CACHE_EXPIRY.SHORT, currentUserId);
    
    // Notify parent
    onSelectChat(chat);
  };

  // Handle search from search component
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    addDebugLog(`🔍 Search: "${query}"`);
  };

  // Handle new chat button click
  const handleNewChatClick = () => {
    setIsModalOpen(true);
    addDebugLog('📝 New chat modal opened');
  };

  // Filter conversations based on search
  const filteredConversations = searchQuery
    ? conversations.filter(conv =>
        conv.channel_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.participants.some(p => 
          p.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : conversations;

  // Determine actual loading state
  const isActuallyLoading = isLoading && !hasLoadedFromCache;

  return (
    <div className={`h-full flex flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] shadow-[var(--shadow-sm)] ${className}`}>
      
      <ChatSidebarHeader 
        onNewChat={handleNewChatClick}
        title="My Chats"
        showNewChatButton={true}
      />
      
      <ChatSidebarSearch 
        onSearchChange={handleSearchChange}
        placeholder="Search conversations..."
      />
      
      {error && !hasLoadedFromCache ? (
        <div className="p-4 text-center text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))/0.1] rounded-[var(--radius)] m-2">
          <p className="mb-3 font-medium">Unable to load conversations</p>
          <p className="mb-3 text-sm">{error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                hasFetched.current = false;
                addDebugLog('🔄 Retry button clicked');
                fetchConversations(true);
              }}
              className="px-4 py-2 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-[var(--radius)] hover:opacity-90 transition-opacity text-sm"
            >
              Retry
            </button>
            <button
              onClick={handleNewChatClick}
              className="px-4 py-2 bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] rounded-[var(--radius)] hover:opacity-90 transition-opacity text-sm"
            >
              New Chat
            </button>
          </div>
        </div>
      ) : (
        <ConversationList
          conversations={filteredConversations}
          isLoading={isActuallyLoading}
          searchQuery={searchQuery}
          selectedChat={selectedChat}
          onSelectChat={handleChatSelect}
        />
      )}
      
      <NewChatModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConversationCreated={handleNewConversation}
      />
    </div>
  );
}