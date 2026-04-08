import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Global state for pending conversation selection
let pendingConversationId: string | null = null;
let conversationSelectCallback: ((conversationId: string) => Promise<void>) | null = null;

export function useSelectConversation() {
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Function to fetch a conversation by ID from the API
  const fetchConversationById = useCallback(async (conversationId) => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/messages/get-conversations');
      if (!response.ok) {
        throw new Error('Failed to fetch conversations');
      }
      
      const allConversations = await response.json();
      const conversation = allConversations.find(
        conv => conv.id === conversationId || conv.channel_id === conversationId
      );
      
      if (conversation) {
        // Transform to match your component's expected format
        const transformedConversation = {
          id: conversation.id || conversation.channel_id,
          channel_id: conversation.channel_id,
          channel_name: conversation.channel_name,
          is_group: conversation.is_group,
          last_message: conversation.last_message_content || conversation.last_message,
          last_message_at: conversation.last_message_at,
          unread_count: conversation.unread_count || 0,
          participants: (conversation.participants || []).map((p) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            email: p.email,
            online: p.online ?? false,
          })),
        };
        
        return transformedConversation;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching conversation:', error);
      toast.error('Failed to load conversation');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Function to select a conversation (can be called programmatically)
  const selectConversation = useCallback((conversation) => {
    if (!conversation) return null;
    
    // Store in conversations cache
    setConversations(prev => {
      const exists = prev.find(c => c.id === conversation.id);
      if (!exists) {
        return [...prev, conversation];
      }
      return prev;
    });
    
    return conversation;
  }, []);

  // Function to select conversation by ID (fetches if needed)
  const selectConversationById = useCallback(async (conversationId) => {
    // First check if we already have it cached
    const cachedConversation = conversations.find(
      conv => conv.id === conversationId || conv.channel_id === conversationId
    );
    
    if (cachedConversation) {
      return selectConversation(cachedConversation);
    }
    
    // If not cached, fetch it
    const conversation = await fetchConversationById(conversationId);
    if (conversation) {
      return selectConversation(conversation);
    }
    
    return null;
  }, [conversations, fetchConversationById, selectConversation]);

  // Function to navigate to messages page and auto-select a conversation
  const openConversation = useCallback((conversationId: string) => {
    // Store the conversation ID we want to open
    pendingConversationId = conversationId;
    
    // Navigate to messages page
    router.push('/dashboard/me/messages');
  }, [router]);

  // Function for the messages page to register its conversation selector
  const registerConversationSelector = useCallback((callback: (conversationId: string) => Promise<void>) => {
    conversationSelectCallback = callback;
    
    // If there's a pending conversation, select it now
    if (pendingConversationId) {
      callback(pendingConversationId);
      pendingConversationId = null; // Clear it after use
    }
  }, []);

  // Function to get any pending conversation ID (and clear it)
  const getPendingConversationId = useCallback(() => {
    const id = pendingConversationId;
    pendingConversationId = null; // Clear after getting
    return id;
  }, []);

  // Function to clear any pending conversation
  const clearPendingConversation = useCallback(() => {
    pendingConversationId = null;
  }, []);

  return {
    // State
    conversations,
    isLoading,
    
    // Actions for external components (like dashboard)
    openConversation,
    
    // Actions for internal conversation management
    selectConversation,
    selectConversationById,
    fetchConversationById,
    
    // Messages page integration
    registerConversationSelector,
    getPendingConversationId,
    clearPendingConversation,
    
    // Cache management
    setConversations,
  };
}