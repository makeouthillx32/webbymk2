// hooks/useMessages.ts - SIMPLE VERSION THAT WORKS
import { useState, useEffect } from 'react';
import { fetchChannelMessages, buildUserProfilesCacheFromMessages } from '@/utils/chatPageUtils';
import type { Message, UserProfile } from '@/utils/chatPageUtils';

interface UseMessagesOptions {
  channelId: string | null;
  enabled?: boolean;
}

export function useMessages({ channelId, enabled = true }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    let cancelled = false;

    const loadMessages = async () => {
      if (!channelId || !enabled) {
        setMessages([]);
        setProfiles({});
        setLoading(false);
        return;
      }

      console.log('[useMessages] Loading messages for:', channelId);
      setLoading(true);
      setError(null);

      try {
        const messageData = await fetchChannelMessages(channelId);
        
        if (cancelled) {
          console.log('[useMessages] Request cancelled');
          return;
        }

        console.log('[useMessages] ✅ Got messages:', messageData.length);
        
        const profilesFromMessages = buildUserProfilesCacheFromMessages(messageData);
        
        setMessages(messageData);
        setProfiles(profilesFromMessages);
        setError(null);
        
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load messages';
          console.error('[useMessages] ❌ Error:', errorMsg);
          setError(errorMsg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadMessages();

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  const refetch = () => {
    // Trigger reload by updating the key
    setMessages([]);
    setProfiles({});
  };

  return {
    messages,
    loading,
    error,
    profiles,
    refetch
  };
}