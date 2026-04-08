// services/messageLoadingService.ts
import { fetchChannelMessages, buildUserProfilesCacheFromMessages } from '@/utils/chatPageUtils';
import type { Message, UserProfile } from '@/utils/chatPageUtils';

interface MessageLoadingResult {
  success: boolean;
  messages: Message[];
  profiles: Record<string, UserProfile>;
  error?: string;
}

export class MessageLoadingService {
  private static instance: MessageLoadingService;
  private loadingChannels = new Set<string>();

  static getInstance(): MessageLoadingService {
    if (!MessageLoadingService.instance) {
      MessageLoadingService.instance = new MessageLoadingService();
    }
    return MessageLoadingService.instance;
  }

  async loadMessages(channelId: string): Promise<MessageLoadingResult> {
    console.log(`[MessageService] ===== STARTING MESSAGE LOAD for chat: ${channelId} =====`);
    
    // Prevent duplicate loading
    if (this.loadingChannels.has(channelId)) {
      console.log(`[MessageService] Already loading channel ${channelId}, skipping`);
      return { success: false, messages: [], profiles: {}, error: 'Already loading' };
    }

    this.loadingChannels.add(channelId);

    try {
      console.log('[MessageService] About to call fetchChannelMessages...');
      const messageData = await fetchChannelMessages(channelId);
      
      console.log('[MessageService] fetchChannelMessages returned:', messageData);
      console.log('[MessageService] Message data type:', typeof messageData);
      console.log('[MessageService] Is array?', Array.isArray(messageData));
      console.log('[MessageService] Length:', messageData?.length);
      
      if (!Array.isArray(messageData)) {
        console.error('[MessageService] ❌ ERROR: messageData is not an array!', messageData);
        return { 
          success: false, 
          messages: [], 
          profiles: {}, 
          error: 'Invalid data format - not an array' 
        };
      }

      console.log(`[MessageService] ✅ Loaded ${messageData.length} messages successfully`);
      console.log('[MessageService] First few messages:', messageData.slice(0, 3));

      // Build user profiles cache from messages
      const profilesFromMessages = buildUserProfilesCacheFromMessages(messageData);
      console.log('[MessageService] Built profiles from messages:', Object.keys(profilesFromMessages));

      console.log('[MessageService] ✅ Message processing completed');
      
      return {
        success: true,
        messages: messageData,
        profiles: profilesFromMessages
      };

    } catch (err) {
      console.error('[MessageService] ❌ ERROR loading messages:', err);
      console.error('[MessageService] Error stack:', err instanceof Error ? err.stack : 'No stack');
      
      return {
        success: false,
        messages: [],
        profiles: {},
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    } finally {
      this.loadingChannels.delete(channelId);
      console.log('[MessageService] ===== MESSAGE LOAD COMPLETED =====');
    }
  }

  isLoading(channelId: string): boolean {
    return this.loadingChannels.has(channelId);
  }

  cancelLoading(channelId: string): void {
    this.loadingChannels.delete(channelId);
  }
}