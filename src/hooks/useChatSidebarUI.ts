// hooks/useChatSidebarUI.ts - UI state for chat sidebar
import { useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation } from '@/app/dashboard/[id]/messages/_components/ChatSidebar';

interface UseChatSidebarUIOptions {
  conversations: Conversation[];
  onSelectChat: (chat: Conversation) => void;
  onMarkAsRead: (channelId: string) => void;
}

export function useChatSidebarUI({ 
  conversations, 
  onSelectChat, 
  onMarkAsRead 
}: UseChatSidebarUIOptions) {
  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle search
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Handle chat selection
  const handleChatSelect = useCallback((chat: Conversation) => {
    console.log('[useChatSidebarUI] 🎯 Chat selected:', chat.channel_name);
    
    // Mark as read
    onMarkAsRead(chat.channel_id);
    
    // Notify parent
    onSelectChat(chat);
  }, [onSelectChat, onMarkAsRead]);

  // Handle new chat modal
  const handleNewChatClick = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Filter conversations based on search
  const filteredConversations = searchQuery
    ? conversations.filter(conv =>
        conv.channel_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  // Format timestamp helper
  const formatTimestamp = useCallback((ts: string | null) =>
    ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : '', []);

  return {
    // State
    searchQuery,
    isModalOpen,
    filteredConversations,
    
    // Handlers
    handleSearchChange,
    handleChatSelect,
    handleNewChatClick,
    handleCloseModal,
    
    // Utils
    formatTimestamp
  };
}