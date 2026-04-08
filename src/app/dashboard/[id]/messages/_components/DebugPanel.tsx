// app/dashboard/[id]/messages/_components/ChatSidebar.tsx (USING NEW HOOKS)
'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import NewChatModal from './NewChatModal';
import ChatSidebarHeader from './ChatSidebarHeader';
import ChatSidebarSearch from './ChatSidebarSearch';
import ConversationList from './ConversationList';
import DebugPanel from './DebugPanel';
import { useRealtimeInsert } from '@/hooks/useRealtimeInsert';
import { useConversationManager } from '@/hooks/useConversationManager';
import { useDebugActions } from '@/hooks/useChatDebugActions';
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
  // Internal state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Refs
  const isMounted = useRef(true);
  
  // NEW HOOKS - Replace all the manual logic
  const conversationManager = useConversationManager({
    userId: currentUserId,
    enableRealtime: true,
    enableDebug: process.env.NODE_ENV === 'development',
    onConversationDeleted
  });

  const debugActions = useDebugActions(currentUserId);
  
  // Supabase client
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Initialize current user (keep existing logic for now)
  useEffect(() => {
    const initializeUser = async () => {
      try {
        conversationManager.cacheManager.addDebugLog('🔍 Starting user initialization...');
        
        // Try to get cached user first
        const cachedUser = storage.get(CACHE_KEYS.CURRENT_USER);
        if (cachedUser?.id) {
          setCurrentUserId(cachedUser.id);
          conversationManager.cacheManager.addDebugLog(`✅ Found cached user: ${cachedUser.id.slice(-4)}`);
          return;
        }

        conversationManager.cacheManager.addDebugLog('🌐 No cached user, fetching from Supabase...');
        
        // If no cached user, get from Supabase
        const { data, error } = await supabase.auth.getUser();
        if (!isMounted.current) {
          conversationManager.cacheManager.addDebugLog('❌ Component unmounted during auth');
          return;
        }
        
        if (error) {
          conversationManager.cacheManager.addDebugLog(`❌ Auth error: ${error.message}`);
          return;
        }
        
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
          conversationManager.cacheManager.addDebugLog(`✅ User authenticated: ${data.user.id.slice(-4)}`);
          
          // Cache user with expiry
          storage.set(CACHE_KEYS.CURRENT_USER, data.user, CACHE_EXPIRY.LONG, data.user.id);
          conversationManager.cacheManager.addDebugLog('💾 User cached successfully');
        } else {
          conversationManager.cacheManager.addDebugLog('❌ No user found in auth response');
        }
      } catch (err) {
        conversationManager.cacheManager.addDebugLog(`❌ Initialization error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    };

    initializeUser();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Handle new conversation
  const handleNewConversation = (conversation: Conversation) => {
    conversationManager.addConversation(conversation);
    onSelectChat(conversation);
  };

  // Handle conversation deleted
  const handleConversationDeleted = (channelId: string) => {
    conversationManager.removeConversation(channelId);
  };

  // Handle chat selection
  const handleChatSelect = (chat: Conversation) => {
    conversationManager.markAsRead(chat.channel_id);
    
    // Store selected chat in cache for restoration
    if (currentUserId) {
      storage.set(CACHE_KEYS.SELECTED_CHAT, chat, CACHE_EXPIRY.SHORT, currentUserId);
    }
    
    onSelectChat(chat);
  };

  // Handle search
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    conversationManager.cacheManager.addDebugLog(`🔍 Search: "${query}"`);
  };

  // Handle new chat button
  const handleNewChatClick = () => {
    setIsModalOpen(true);
    conversationManager.cacheManager.addDebugLog('📝 New chat modal opened');
  };

  // Enhanced delete flow with hooks
  const handleDeleteConversationFlow = async (channelId: string) => {
    try {
      conversationManager.cacheManager.addDebugLog(`🗑️ Starting delete flow for: ${channelId.slice(-4)}`);
      
      // Step 1: Call delete API
      const response = await fetch(`/api/messages/${channelId}/delete`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Delete API failed');
      }

      // Step 2: Clean up cache after successful delete
      conversationManager.cacheManager.addDebugLog('🧹 Cleaning up cache after delete');
      debugActions.cleanupExpired();
      
      // Step 3: Remove from local state
      conversationManager.removeConversation(channelId);
      
      // Step 4: Force refresh to ensure sync
      conversationManager.cacheManager.addDebugLog('🔄 Force refresh after delete');
      await conversationManager.refresh();
      
      conversationManager.cacheManager.addDebugLog('✅ Delete flow completed');
      
    } catch (error) {
      conversationManager.cacheManager.addDebugLog(`❌ Delete flow failed: ${error}`);
      throw error;
    }
  };

  // Filter conversations based on search
  const filteredConversations = conversationManager.searchConversations(searchQuery);

  return (
    <div className={`h-full flex flex-col bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] border-r border-[hsl(var(--sidebar-border))] shadow-[var(--shadow-sm)] ${className}`}>
      
      {/* Debug Panel using our new DebugPanel component */}
      <DebugPanel
        userId={currentUserId}
        conversations={conversationManager.conversations}
        hasLoadedFromCache={conversationManager.hasLoadedFromCache}
        isLoading={conversationManager.isLoading}
        cacheInfo={conversationManager.cacheInfo}
        debugLog={conversationManager.debugLog}
        onRefresh={conversationManager.refresh}
      />

      <ChatSidebarHeader 
        onNewChat={handleNewChatClick}
        title="My Chats"
        showNewChatButton={true}
      />
      
      <ChatSidebarSearch 
        onSearchChange={handleSearchChange}
        placeholder="Search conversations..."
      />
      
      {conversationManager.error && !conversationManager.hasLoadedFromCache ? (
        <div className="p-4 text-center text-[hsl(var(--destructive))] bg-[hsl(var(--destructive))/0.1] rounded-[var(--radius)] m-2">
          <p className="mb-3 font-medium">Unable to load conversations</p>
          <p className="mb-3 text-sm">{conversationManager.error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => {
                conversationManager.cacheManager.addDebugLog('🔄 Retry button clicked');
                conversationManager.refresh();
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
          isLoading={conversationManager.isLoading}
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