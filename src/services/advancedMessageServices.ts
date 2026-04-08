// services/advancedMessageServices.ts
import { toast } from 'react-hot-toast';
import {
  fetchChannelMessages,
  transformRealtimeMessage,
  buildUserProfilesCacheFromMessages,
  type Message,
  type UserProfile
} from '@/utils/chatPageUtils';

// Message Loading Service
export class MessageLoader {
  private isLoadingRef = { current: false };
  
  constructor(
    private setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    private setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    private setUserProfiles: React.Dispatch<React.SetStateAction<Record<string, UserProfile>>>,
    private messagesEndRef: React.RefObject<HTMLDivElement>,
    private isMounted: React.RefObject<boolean>
  ) {}

  async loadMessages(channelId: string) {
    if (!channelId) {
      this.setMessages([]);
      return;
    }
    
    if (this.isLoadingRef.current) return;
    
    this.isLoadingRef.current = true;
    this.setLoading(true);
    
    try {
      console.log(`[MessageLoader] Loading messages for channel: ${channelId}`);
      const messageData = await fetchChannelMessages(channelId);
      
      if (!this.isMounted.current) return;
      
      // Build user profiles cache from messages
      const profilesFromMessages = buildUserProfilesCacheFromMessages(messageData);
      this.setUserProfiles(prev => ({ ...prev, ...profilesFromMessages }));
      
      this.setMessages(messageData);
      
      // Scroll to bottom
      this.scrollToBottom();
      
    } catch (err) {
      console.error('[MessageLoader] Error loading messages:', err);
      toast.error("Failed to load messages");
    } finally {
      if (this.isMounted.current) {
        this.setLoading(false);
        this.isLoadingRef.current = false;
      }
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.isMounted.current && this.messagesEndRef.current) {
        this.messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  }
}

// Realtime Message Handler
export class RealtimeMessageHandler {
  constructor(
    private setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    private messagesEndRef: React.RefObject<HTMLDivElement>,
    private isMounted: React.RefObject<boolean>,
    private getUserProfile: (userId: string, participants: any[]) => UserProfile | null
  ) {}

  handleNewMessage = (newMsg: any, currentUserId: string | null, channelId: string | null, participants: any[]) => {
    if (!this.isMounted.current || !channelId) return;
    
    console.log('[RealtimeHandler] Processing new message:', newMsg);
    
    if (newMsg.sender_id !== currentUserId) {
      toast.success('New message received!');
    }
    
    const senderProfile = this.getUserProfile(newMsg.sender_id, participants);
    const transformedMessage = transformRealtimeMessage(newMsg, senderProfile);
    
    this.setMessages(prev => {
      // Replace temp message if it exists
      const tempIndex = prev.findIndex(msg => 
        msg.sender.id === newMsg.sender_id && 
        msg.content === newMsg.content && 
        String(msg.id).startsWith('temp-')
      );
      
      if (tempIndex >= 0) {
        const newMessages = [...prev];
        newMessages[tempIndex] = transformedMessage;
        return newMessages;
      }
      
      // Don't add duplicates
      if (prev.some(msg => msg.id === newMsg.id)) {
        return prev;
      }
      
      return [...prev, transformedMessage];
    });
    
    // Scroll to bottom
    this.scrollToBottom();
  };

  private scrollToBottom() {
    setTimeout(() => {
      if (this.isMounted.current && this.messagesEndRef.current) {
        this.messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  }
}

// Component State Manager
export class ChatMessagesStateManager {
  public isMounted = { current: true };
  
  constructor() {
    // Setup cleanup on creation
    this.setupCleanup();
  }

  private setupCleanup() {
    // This would be called from useEffect cleanup
    return () => {
      this.isMounted.current = false;
    };
  }

  getCleanupFunction() {
    return () => {
      this.isMounted.current = false;
    };
  }

  // Helper to create refs in a standardized way
  static createRefs() {
    return {
      messagesEndRef: { current: null } as React.RefObject<HTMLDivElement>,
      isMounted: { current: true } as React.RefObject<boolean>
    };
  }

  // Helper to initialize state
  static getInitialState() {
    return {
      messages: [] as Message[],
      loading: false,
      userProfiles: {} as Record<string, UserProfile>,
      contextMenu: null as any,
      isDeleting: null as string | number | null
    };
  }
}

// Event Handler Coordinator
export class EventHandlerCoordinator {
  constructor(
    private contextMenuManager: React.RefObject<any>,
    private currentUserId: string | null
  ) {}

  createHandlers() {
    return {
      handleContextMenu: (e: React.MouseEvent, messageId: string | number, messageContent: string, senderId: string) => {
        this.contextMenuManager.current?.handleContextMenu(e, messageId, messageContent, senderId, this.currentUserId);
      },

      handleTouchStart: (messageId: string | number, messageContent: string, senderId: string, element: HTMLElement) => {
        this.contextMenuManager.current?.handleTouchStart(messageId, messageContent, senderId, element, this.currentUserId);
      },

      handleTouchEnd: () => {
        this.contextMenuManager.current?.handleTouchEnd();
      }
    };
  }
}

// Service Factory - Creates all services with proper dependencies
export class ChatMessagesServiceFactory {
  static createServices(
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setUserProfiles: React.Dispatch<React.SetStateAction<Record<string, UserProfile>>>,
    setContextMenu: React.Dispatch<React.SetStateAction<any>>,
    userProfiles: Record<string, UserProfile>,
    messages: Message[],
    messagesEndRef: React.RefObject<HTMLDivElement>,
    isMounted: React.RefObject<boolean>,
    getUserProfile: (userId: string, participants: any[]) => UserProfile | null
  ) {
    const messageLoader = new MessageLoader(
      setMessages,
      setLoading,
      setUserProfiles,
      messagesEndRef,
      isMounted
    );

    const realtimeHandler = new RealtimeMessageHandler(
      setMessages,
      messagesEndRef,
      isMounted,
      getUserProfile
    );

    const stateManager = new ChatMessagesStateManager();

    return {
      messageLoader,
      realtimeHandler,
      stateManager
    };
  }
}