// app/dashboard/[id]/messages/page.tsx (FIXED - No more duplicate messages)
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';
import ChatSidebar, { Conversation } from './_components/ChatSidebar';
import ChatHeader from './_components/ChatHeader';
import ChatMessages from './_components/ChatMessages';
import MessageInput from './_components/MessageInput';
import ChatRightSidebar from './_components/ChatRightSidebar';
import Breadcrumb from '@/components/Breadcrumbs/dashboard';
import LoadingSVG from '@/app/_components/_events/loading-page';
import { useRealtimeInsert } from '@/hooks/useRealtimeInsert';
import { useMessages } from '@/hooks/useMessages';
import {
  sendMessage,
  createOptimisticMessage,
  transformRealtimeMessage,
  getUserProfileFromParticipants,
  buildUserProfilesCache,
  resolveChatDisplayName,
  type Message,
  type UserProfile
} from '@/utils/chatPageUtils';
import './_components/mobile.scss';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const avatarColors = {
  AL: 'bg-blue-500',
  JA: 'bg-orange-500',
  JE: 'bg-green-500',
};

export default function ChatPage() {
  // Core state
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [authLoading, setAuthLoading] = useState(true);
  
  // NEW: Additional messages state for real-time updates
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  
  // UI state
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMounted = useRef(true);

  // Use messages hook
  const { 
    messages: baseMessages, 
    loading: loadingMessages, 
    error: messagesError, 
    profiles: messageProfiles,
    refetch: refetchMessages 
  } = useMessages({
    channelId: selectedChat?.id || null,
    enabled: !!selectedChat && !!currentUserId && !authLoading
  });

  // FIXED: Much simpler message combining - just use baseMessages, let realtime add to it
  const allMessages = (() => {
    // Start with base messages from server
    const messageMap = new Map<string | number, Message>();
    
    // Add all base messages (these are the "truth")
    baseMessages.forEach(msg => {
      messageMap.set(msg.id, msg);
    });
    
    // Only add realtime messages that don't exist in base messages
    realtimeMessages.forEach(msg => {
      if (!messageMap.has(msg.id)) {
        // For temporary messages, check if a similar message exists in base
        if (String(msg.id).startsWith('temp-')) {
          const similar = baseMessages.find(baseMsg => 
            baseMsg.content === msg.content &&
            baseMsg.sender.id === msg.sender.id &&
            Math.abs(new Date(baseMsg.timestamp).getTime() - new Date(msg.timestamp).getTime()) < 10000 // 10 seconds
          );
          
          if (!similar) {
            messageMap.set(msg.id, msg);
          }
        } else {
          messageMap.set(msg.id, msg);
        }
      }
    });
    
    return Array.from(messageMap.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  })();

  // Clear realtime messages when switching chats OR when base messages load
  useEffect(() => {
    console.log('[ChatPage] Clearing realtime messages for chat switch');
    setRealtimeMessages([]);
  }, [selectedChat?.id]);

  // AGGRESSIVE cleanup: Clear realtime messages when base messages load
  useEffect(() => {
    if (baseMessages.length > 0 && realtimeMessages.length > 0) {
      console.log('[ChatPage] Base messages loaded, cleaning up realtime messages');
      
      // Keep only realtime messages that are very recent (last 30 seconds) and not in base
      const now = Date.now();
      setRealtimeMessages(prev => {
        const cleaned = prev.filter(realtimeMsg => {
          // If it's older than 30 seconds, remove it (it should be in base messages by now)
          const msgTime = new Date(realtimeMsg.timestamp).getTime();
          if (now - msgTime > 30000) {
            console.log('[ChatPage] Removing old realtime message:', realtimeMsg.id);
            return false;
          }
          
          // If it exists in base messages, remove it
          const existsInBase = baseMessages.some(baseMsg => {
            if (baseMsg.id === realtimeMsg.id) return true;
            
            // Check for similar content (for temporary messages)
            if (String(realtimeMsg.id).startsWith('temp-')) {
              return baseMsg.content === realtimeMsg.content &&
                     baseMsg.sender.id === realtimeMsg.sender.id &&
                     Math.abs(new Date(baseMsg.timestamp).getTime() - msgTime) < 10000;
            }
            
            return false;
          });
          
          if (existsInBase) {
            console.log('[ChatPage] Removing duplicate realtime message:', realtimeMsg.id);
          }
          
          return !existsInBase;
        });
        
        if (cleaned.length !== prev.length) {
          console.log(`[ChatPage] Cleaned realtime messages: ${prev.length} → ${cleaned.length}`);
        }
        
        return cleaned;
      });
    }
  }, [baseMessages]);

  // Initialize authentication
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setAuthLoading(true);
        console.log("[ChatPage] Initializing authentication");
        
        const { data, error } = await supabase.auth.getUser();
        
        if (error) {
          console.error("[ChatPage] Auth error:", error);
          setCurrentUserId(null);
          return;
        }
        
        if (data?.user?.id) {
          console.log("[ChatPage] User authenticated:", data.user.id);
          setCurrentUserId(data.user.id);
        } else {
          console.log("[ChatPage] No authenticated user found");
          setCurrentUserId(null);
        }
      } catch (err) {
        console.error("[ChatPage] Auth initialization error:", err);
        setCurrentUserId(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initializeAuth();
    
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Handle responsive layout
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Update profiles when message profiles change
  useEffect(() => {
    if (messageProfiles && Object.keys(messageProfiles).length > 0) {
      console.log('[ChatPage] Updating profiles from messages:', Object.keys(messageProfiles));
      setUserProfiles(prev => ({ ...prev, ...messageProfiles }));
    }
  }, [messageProfiles]);

  // Update profiles when chat participants change
  useEffect(() => {
    if (selectedChat?.participants) {
      const profilesFromParticipants = buildUserProfilesCache(selectedChat.participants);
      console.log('[ChatPage] Built profiles from participants:', Object.keys(profilesFromParticipants));
      setUserProfiles(prev => ({ ...prev, ...profilesFromParticipants }));
    }
  }, [selectedChat?.participants]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (allMessages.length > 0 && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [allMessages.length]);

  // Get user profile helper
  const getUserProfile = useCallback((userId: string): UserProfile | null => {
    if (userProfiles[userId]) {
      return userProfiles[userId];
    }
    
    if (selectedChat?.participants) {
      const profile = getUserProfileFromParticipants(userId, selectedChat.participants);
      if (profile) {
        setUserProfiles(prev => ({ ...prev, [userId]: profile }));
        return profile;
      }
    }
    
    return null;
  }, [userProfiles, selectedChat?.participants]);

  const handleRealtimeMessage = useCallback((newMsg: any) => {
    console.log('[ChatPage] 🔥 REALTIME MESSAGE:', {
      messageId: newMsg.id,
      channelId: newMsg.channel_id,
      senderId: newMsg.sender_id,
      content: newMsg.content?.substring(0, 30) + '...',
      selectedChatId: selectedChat?.id
    });
    
    if (!isMounted.current) {
      console.log('[ChatPage] Component unmounted, ignoring message');
      return;
    }
    
    if (!selectedChat || newMsg.channel_id !== selectedChat.id) {
      console.log(`[ChatPage] Message for different channel, ignoring`);
      return;
    }
    
    // CRITICAL FIX: Update realtime messages in one operation
    setRealtimeMessages(prev => {
      // First, remove any matching optimistic message
      const withoutOptimistic = prev.filter(msg => {
        // Keep non-temp messages
        if (!String(msg.id).startsWith('temp-')) {
          return true;
        }
        
          // Remove temp message if it matches this real message
          const isMatch = msg.content === newMsg.content &&
                        msg.sender.id === newMsg.sender_id &&
                        Math.abs(new Date(msg.timestamp).getTime() - new Date(newMsg.created_at).getTime()) < 15000;
          
          if (isMatch) {
            console.log('[ChatPage] ✅ Removing optimistic message:', msg.id, 'for real message:', newMsg.id);
            return false; // Remove this optimistic message
          }
          
          return true;
        });
        
        // Check if this real message already exists
        const existsInRealtime = withoutOptimistic.some(msg => msg.id === newMsg.id);
        const existsInBase = baseMessages.some(msg => msg.id === newMsg.id);
        
        if (existsInRealtime || existsInBase) {
          console.log('[ChatPage] Real message already exists, skipping:', newMsg.id);
          return withoutOptimistic; // Return without the optimistic, but don't add duplicate
        }
        
        // Get sender profile
        let senderProfile = userProfiles[newMsg.sender_id];
        if (!senderProfile && selectedChat?.participants) {
          senderProfile = getUserProfileFromParticipants(newMsg.sender_id, selectedChat.participants);
        }
        
        // If still no profile, create a basic one
        if (!senderProfile) {
          senderProfile = {
            id: newMsg.sender_id,
            name: 'Unknown User',
            avatar: newMsg.sender_id.charAt(0).toUpperCase(),
            email: ''
          };
        }
        
        // Transform and add the real message
        const transformedMessage = transformRealtimeMessage(newMsg, senderProfile);
        console.log('[ChatPage] ✅ Adding real message:', transformedMessage.id);
        
        return [...withoutOptimistic, transformedMessage];
      });
      
      // Show toast for messages from other users only
      if (newMsg.sender_id !== currentUserId) {
        toast.success('New message received!');
      }
      
    }, [currentUserId, selectedChat?.id, selectedChat?.participants, userProfiles, baseMessages]);

  // Realtime subscription
  useRealtimeInsert({
    supabase,
    table: 'messages',
    filter: selectedChat ? `channel_id=eq.${selectedChat.id}` : undefined,
    enabled: !!selectedChat && !!currentUserId && !authLoading,
    onInsert: handleRealtimeMessage,
  });

  // Send message handler
  const handleSendMessage = useCallback(async (e: React.FormEvent, attachments: any[] = []) => {
    e.preventDefault();
    
    if ((!messageText.trim() && !attachments.length) || !selectedChat || !currentUserId) {
      if (!messageText.trim() && !attachments.length) return;
      toast.error("Cannot send message - please try again");
      return;
    }
    
    const messageContent = messageText.trim() || '';
    setMessageText('');
    
    // Get user profile for optimistic message
    const userProfile = getUserProfile(currentUserId) || {
      id: currentUserId,
      name: 'You',
      avatar: currentUserId.charAt(0).toUpperCase(),
      email: ''
    };
    
    // Create optimistic message for immediate UI feedback
    const optimisticMessage = createOptimisticMessage(currentUserId, messageContent, userProfile, attachments);
    console.log('[ChatPage] Adding optimistic message:', optimisticMessage.id);
    
    // Add optimistic message immediately
    setRealtimeMessages(prev => [...prev, optimisticMessage]);
    
    try {
      await sendMessage(selectedChat.id, currentUserId, messageContent, attachments);
      console.log('[ChatPage] Message sent successfully');
      
      // The optimistic message will be cleaned up automatically when the real message arrives
      
    } catch (err) {
      console.error('[ChatPage] Error sending message:', err);
      
      // Only remove optimistic message on error
      setRealtimeMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
      toast.error("Failed to send message");
    }
  }, [messageText, selectedChat, currentUserId, getUserProfile]);

  // Event handlers
  const handleSelectChat = useCallback((chat: Conversation) => {
    console.log("[ChatPage] Selected chat:", chat.id);
    setSelectedChat(chat);
    setUserProfiles({}); // Clear profiles when switching chats
    setRealtimeMessages([]); // Clear realtime messages
    toast.success(`Chat opened: ${chat.channel_name || 'New conversation'}`);
  }, []);

  const handleBackToConversations = useCallback(() => {
    console.log("[ChatPage] Going back to conversations");
    setSelectedChat(null);
    setUserProfiles({});
    setRealtimeMessages([]);
  }, []);

  const handleMessageDelete = useCallback((messageId: string | number) => {
    console.log("[ChatPage] Message deleted:", messageId);
    
    // Remove from realtime messages if it exists there
    setRealtimeMessages(prev => prev.filter(msg => msg.id !== messageId));
    
    // Refetch base messages to update the list
    refetchMessages();
  }, [refetchMessages]);

  const handleConversationDeleted = useCallback((channelId: string) => {
    console.log("[ChatPage] Conversation deleted:", channelId);
    setShowRightSidebar(false);
    handleBackToConversations();
  }, [handleBackToConversations]);

  // UI handlers
  const handleInfoClick = useCallback(() => {
    setShowRightSidebar(prev => !prev);
  }, []);

  const handleRightSidebarClose = useCallback(() => {
    setShowRightSidebar(false);
  }, []);

  // Computed values
  const pageTitle = selectedChat ? resolveChatDisplayName(selectedChat, currentUserId) : 'Messages';

  console.log('[ChatPage] Render state:', {
    selectedChat: selectedChat?.id,
    baseMessagesCount: baseMessages.length,
    realtimeMessagesCount: realtimeMessages.length,
    totalMessagesCount: allMessages.length,
    loadingMessages,
    authLoading,
    currentUserId
  });

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <>
        <Breadcrumb pageName="Messages" />
        <div className="chat-container">
          <div className="flex-1 flex items-center justify-center">
            <LoadingSVG />
          </div>
        </div>
      </>
    );
  }

  // Show error if no user found
  if (!currentUserId) {
    return (
      <>
        <Breadcrumb pageName="Messages" />
        <div className="chat-container">
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Authentication Required</h2>
              <p className="text-gray-600">Please sign in to access messages.</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Render conversation list view
  if (!selectedChat) {
    return (
      <>
        <Breadcrumb pageName="Messages" />
        <div className="chat-container">
          {!isMobile ? (
            <>
              <div className="chat-sidebar">
                <ChatSidebar 
                  selectedChat={null} 
                  onSelectChat={handleSelectChat}
                  onConversationDeleted={handleConversationDeleted}
                />
              </div>
              <div className="flex-1 flex items-center justify-center">
                <h2>Select a conversation</h2>
              </div>
            </>
          ) : (
            <div className="mobile-conversation-list">
              <ChatSidebar 
                selectedChat={null} 
                onSelectChat={handleSelectChat}
                onConversationDeleted={handleConversationDeleted}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  // Render chat view
  return (
    <>
      <Breadcrumb pageName={pageTitle} />
      <div className="chat-container">
        {!isMobile ? (
          <>
            <div className="chat-sidebar">
              <ChatSidebar 
                selectedChat={selectedChat} 
                onSelectChat={handleSelectChat}
                onConversationDeleted={handleConversationDeleted}
              />
            </div>
            <div className="chat-content">
              <ChatHeader
                selectedChat={selectedChat}
                currentUserId={currentUserId}
                onInfoClick={handleInfoClick}
              />
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <LoadingSVG />
                </div>
              ) : messagesError ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-red-500 mb-2">Error loading messages</p>
                    <button 
                      onClick={refetchMessages}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <ChatMessages
                    messages={allMessages}
                    currentUserId={currentUserId}
                    messagesEndRef={messagesEndRef}
                    avatarColors={avatarColors}
                    onMessageDelete={handleMessageDelete}
                  />
                  <MessageInput
                    message={messageText}
                    onSetMessage={setMessageText}
                    handleSendMessage={handleSendMessage}
                  />
                </>
              )}
            </div>
            {showRightSidebar && (
              <div className="chat-right-sidebar">
                <ChatRightSidebar
                  selectedChat={selectedChat}
                  currentUserId={currentUserId}
                  onClose={handleRightSidebarClose}
                  onConversationDeleted={handleConversationDeleted}
                />
              </div>
            )}
          </>
        ) : (
          <div className="mobile-chat-view">
            <ChatHeader
              selectedChat={selectedChat}
              currentUserId={currentUserId}
              onInfoClick={handleInfoClick}
              onBackClick={handleBackToConversations}
              showBackButton={true}
            />
            {loadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <LoadingSVG />
              </div>
            ) : messagesError ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-red-500 mb-2">Error loading messages</p>
                  <button 
                    onClick={refetchMessages}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <>
                <ChatMessages
                  messages={allMessages}
                  currentUserId={currentUserId}
                  messagesEndRef={messagesEndRef}
                  avatarColors={avatarColors}
                  onMessageDelete={handleMessageDelete}
                />
                <MessageInput
                  message={messageText}
                  onSetMessage={setMessageText}
                  handleSendMessage={handleSendMessage}
                />
              </>
            )}
            {showRightSidebar && (
              <div 
                className="mobile-right-sidebar-overlay"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowRightSidebar(false);
                  }
                }}
              >
                <div className="chat-right-sidebar-content">
                  <ChatRightSidebar
                    selectedChat={selectedChat}
                    currentUserId={currentUserId}
                    onClose={handleRightSidebarClose}
                    onConversationDeleted={handleConversationDeleted}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}