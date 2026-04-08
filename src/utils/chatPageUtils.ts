// utils/chatPageUtils.ts (FIXED - Handle empty messages gracefully)
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'react-hot-toast';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface Message {
  id: string | number;
  sender: {
    id: string;
    name: string;
    avatar: string;
    email: string;
  };
  content: string;
  timestamp: string;
  likes: number;
  image: string | null;
  attachments?: any[];
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  email: string;
}

// Fetch messages for a channel with better empty state handling
export async function fetchChannelMessages(channelId: string): Promise<Message[]> {
  console.log(`[ChatUtils] 🔍 DEBUG - Channel ID details:`, {
    channelId,
    type: typeof channelId,
    length: channelId?.length,
    isString: typeof channelId === 'string',
    firstChar: channelId?.[0],
    value: channelId
  });
  
  // Validate channel ID before making API call
  if (!isValidChannelId(channelId)) {
    console.error(`[ChatUtils] ❌ Invalid channel ID format:`, channelId);
    return [];
  }
  
  console.log(`[ChatUtils] Fetching messages for channel: ${channelId}`);
  
  try {
    const res = await fetch(`/api/messages/${channelId}`);
    
    // Check if response is ok
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[ChatUtils] API error: ${res.status} - ${errorText}`);
      
      // Handle specific error cases gracefully
      if (res.status === 400) {
        console.log(`[ChatUtils] Bad request for channel ${channelId} - likely invalid ID format`);
        return [];
      }
      
      if (res.status === 403) {
        console.log(`[ChatUtils] Access denied to channel ${channelId}`);
        return [];
      }
      
      if (res.status === 404) {
        console.log(`[ChatUtils] Channel ${channelId} not found or no access`);
        return [];
      }
      
      if (res.status === 500) {
        console.log(`[ChatUtils] Server error for channel ${channelId}, likely no messages yet`);
        return [];
      }
      
      throw new Error(`Failed to load messages: ${res.status} - ${errorText}`);
    }
    
    // Try to parse response
    const messageData = await res.json();
    
    // Handle null or undefined response
    if (!messageData) {
      console.log(`[ChatUtils] No message data returned for channel ${channelId}`);
      return [];
    }
    
    // Handle non-array response
    if (!Array.isArray(messageData)) {
      console.warn(`[ChatUtils] Expected array but got ${typeof messageData} for channel ${channelId}`);
      return [];
    }
    
    console.log(`[ChatUtils] ✅ Received ${messageData.length} messages from API`);
    
    // Return sorted messages or empty array
    return messageData.length > 0 
      ? messageData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : [];
      
  } catch (error) {
    console.error(`[ChatUtils] Error fetching messages for channel ${channelId}:`, error);
    
    // Don't throw error for network issues - return empty array
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.log(`[ChatUtils] Network error, returning empty messages array`);
      return [];
    }
    
    // For other errors, still throw but with better message
    throw new Error(`Failed to load messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Send a message with attachments
export async function sendMessage(
  channelId: string,
  currentUserId: string,
  messageContent: string,
  attachments: any[] = []
): Promise<string> {
  console.log(`[ChatUtils] Sending message to channel ${channelId}:`, messageContent.substring(0, 50) + '...');
  
  try {
    const { data: messageData, error: messageError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: currentUserId,
        content: messageContent
      })
      .select('id')
      .single();
      
    if (messageError) {
      console.error('[ChatUtils] Message send error:', messageError);
      throw new Error(`Failed to send message: ${messageError.message}`);
    }
    
    if (!messageData?.id) {
      throw new Error('Failed to send message: No message ID returned');
    }
    
    // Handle attachments if present
    if (attachments.length > 0) {
      const attachmentInserts = attachments.map(attachment => ({
        message_id: messageData.id,
        file_url: attachment.url,
        file_type: attachment.type,
        file_name: attachment.name,
        file_size: attachment.size
      }));
      
      const { error: attachmentError } = await supabase
        .from('message_attachments')
        .insert(attachmentInserts);
        
      if (attachmentError) {
        console.error('[ChatUtils] Attachment save error:', attachmentError);
        toast.error("Message sent but attachments failed to save");
      } else {
        toast.success(`Message sent with ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}!`);
      }
    }
    
    console.log(`[ChatUtils] ✅ Message sent successfully: ${messageData.id}`);
    return messageData.id;
    
  } catch (error) {
    console.error('[ChatUtils] Error in sendMessage:', error);
    throw error;
  }
}

// Create optimistic message for UI
export function createOptimisticMessage(
  currentUserId: string,
  messageContent: string,
  userProfile: UserProfile,
  attachments: any[] = []
): Message {
  const optimisticId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: optimisticId,
    content: messageContent,
    timestamp: new Date().toISOString(),
    likes: 0,
    image: attachments?.find(a => a.type === 'image')?.url || null,
    attachments: attachments || [],
    sender: {
      id: currentUserId,
      name: userProfile.name,
      avatar: userProfile.avatar,
      email: userProfile.email
    }
  };
}

// Transform realtime message
export function transformRealtimeMessage(newMsg: any, senderProfile: UserProfile | null): Message {
  return {
    id: newMsg.id,
    content: newMsg.content || '',
    timestamp: newMsg.created_at || new Date().toISOString(),
    likes: 0,
    image: null,
    sender: {
      id: newMsg.sender_id,
      name: senderProfile?.name || newMsg.sender_name || 'Unknown User',
      avatar: senderProfile?.avatar || newMsg.sender_avatar || newMsg.sender_id?.charAt(0)?.toUpperCase() || 'U', 
      email: senderProfile?.email || newMsg.sender_email || '',
    }
  };
}

// Get user profile from participants
export function getUserProfileFromParticipants(
  userId: string,
  participants: any[]
): UserProfile | null {
  if (!Array.isArray(participants)) {
    console.warn('[ChatUtils] Participants is not an array:', participants);
    return null;
  }
  
  const participant = participants.find(p => p.user_id === userId);
  if (participant) {
    return {
      id: participant.user_id,
      name: participant.display_name || 'User',
      avatar: participant.avatar_url || participant.display_name?.charAt(0)?.toUpperCase() || 'U',
      email: participant.email || ''
    };
  }
  return null;
}

// Build user profiles cache from participants
export function buildUserProfilesCache(participants: any[]): Record<string, UserProfile> {
  const cache: Record<string, UserProfile> = {};
  
  if (!Array.isArray(participants)) {
    console.warn('[ChatUtils] Cannot build cache: participants is not an array');
    return cache;
  }
  
  participants.forEach(participant => {
    if (participant?.user_id) {
      cache[participant.user_id] = {
        id: participant.user_id,
        name: participant.display_name || 'User',
        avatar: participant.avatar_url || participant.display_name?.charAt(0)?.toUpperCase() || 'U',
        email: participant.email || ''
      };
    }
  });
  
  return cache;
}

// Build user profiles cache from messages
export function buildUserProfilesCacheFromMessages(messages: Message[]): Record<string, UserProfile> {
  const cache: Record<string, UserProfile> = {};
  
  if (!Array.isArray(messages)) {
    console.warn('[ChatUtils] Cannot build cache: messages is not an array');
    return cache;
  }
  
  messages.forEach(message => {
    if (message?.sender?.id) {
      cache[message.sender.id] = {
        id: message.sender.id,
        name: message.sender.name || 'User',
        avatar: message.sender.avatar || message.sender.name?.charAt(0)?.toUpperCase() || 'U',
        email: message.sender.email || ''
      };
    }
  });
  
  return cache;
}

// Resolve chat display name with better error handling
export function resolveChatDisplayName(
  selectedChat: any,
  currentUserId: string | null
): string {
  if (!selectedChat) {
    return 'No Chat Selected';
  }

  // Use explicit channel name if available
  if (selectedChat.channel_name && selectedChat.channel_name.trim()) {
    return selectedChat.channel_name.trim();
  }

  // For non-group chats, try to build name from participants
  if (!selectedChat.is_group && Array.isArray(selectedChat.participants)) {
    const otherParticipants = selectedChat.participants
      .filter((p: any) => p.user_id !== currentUserId)
      .map((p: any) => p.display_name || p.email || 'User')
      .filter(name => name && name.trim());
    
    if (otherParticipants.length > 0) {
      return otherParticipants.join(', ');
    }
  }

  // Fallback names
  if (selectedChat.is_group) {
    return 'Unnamed Group';
  } else {
    return 'Direct Message';
  }
}

// Initialize Supabase auth with better error handling
export async function initializeAuth(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error("[ChatUtils] Auth error:", error.message);
      return null;
    }
    
    if (data?.user?.id) {
      console.log("[ChatUtils] ✅ User authenticated:", data.user.id.substring(0, 8) + '...');
      return data.user.id;
    }
    
    console.log("[ChatUtils] No authenticated user found");
    return null;
  } catch (err) {
    console.error("[ChatUtils] Auth initialization error:", err);
    return null;
  }
}

// Helper function to validate channel ID
export function isValidChannelId(channelId: any): channelId is string {
  if (typeof channelId !== 'string') {
    return false;
  }
  
  // Basic UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(channelId);
}

// Enhanced helper function to safely get channel ID from chat objects (matches your schema)
export function extractChannelId(chatObject: any): string | null {
  if (!chatObject) {
    console.warn('[ChatUtils] No chat object provided to extractChannelId');
    return null;
  }
  
  console.log('[ChatUtils] 🔍 Extracting channel ID from:', {
    hasChannelId: !!chatObject.channel_id,
    hasId: !!chatObject.id,
    channelIdValue: chatObject.channel_id,
    idValue: chatObject.id,
    objectKeys: Object.keys(chatObject)
  });
  
  // Try different possible ID fields based on your schema
  const possibleIds = [
    chatObject.channel_id,  // Primary: channels.id from your schema
    chatObject.id,          // Fallback: might be the same as channel_id
    chatObject.channelId    // Alternative naming
  ];
  
  for (const id of possibleIds) {
    if (isValidChannelId(id)) {
      console.log('[ChatUtils] ✅ Found valid channel ID:', id);
      return id;
    }
  }
  
  console.error('[ChatUtils] ❌ Could not extract valid channel ID from chat object:', {
    chatObject,
    possibleIds,
    allKeys: Object.keys(chatObject)
  });
  return null;
}