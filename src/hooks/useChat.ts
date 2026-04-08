import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

/**
 * Hook to subscribe to and fetch chat messages for a given channel.
 */
export function useChat(channelId: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!channelId) return;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      // Type assertion since Supabase returns a generic any[]
      setMessages(data as Message[]);
    }

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`channel:${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        payload => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      // Cleanup subscription
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  /**
   * Send a new chat message.
   */
  const sendMessage = async (content: string) => {
    const user = await supabase.auth.getUser();
    const senderId = user.data.user?.id;
    if (!senderId) {
      console.error('User not authenticated');
      return;
    }

    const { error } = await supabase
      .from('messages')
      .insert([{ channel_id: channelId, sender_id: senderId, content }]);

    if (error) {
      console.error('Error sending message:', error);
    }
  };

  return { messages, sendMessage };
}
