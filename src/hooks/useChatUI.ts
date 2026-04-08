// hooks/useChatUI.ts - UI state management hook
import { useState, useEffect, useRef, useCallback } from 'react';
import { resolveChatDisplayName } from '@/utils/chatPageUtils';
import type { Conversation } from '@/app/dashboard/[id]/messages/_components/ChatSidebar';
import type { Message } from '@/utils/chatPageUtils';

interface UseChatUIOptions {
  selectedChat: Conversation | null;
  currentUserId: string | null;
  allMessages: Message[];
}

export function useChatUI({ selectedChat, currentUserId, allMessages }: UseChatUIOptions) {
  // UI state
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle responsive layout
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (allMessages.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [allMessages.length]);

  // UI handlers
  const handleInfoClick = useCallback(() => {
    setShowRightSidebar(prev => !prev);
  }, []);

  const handleRightSidebarClose = useCallback(() => {
    setShowRightSidebar(false);
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setShowRightSidebar(false);
    }
  }, []);

  // Computed values
  const pageTitle = selectedChat ? resolveChatDisplayName(selectedChat, currentUserId) : 'Messages';

  return {
    // State
    showRightSidebar,
    setShowRightSidebar,
    isMobile,
    messagesEndRef,
    pageTitle,
    
    // Handlers
    handleInfoClick,
    handleRightSidebarClose,
    handleOverlayClick
  };
}