// hooks/useSharedMedia.ts
import { useState, useEffect } from 'react';
import { fetchChannelMessages } from '@/utils/chatPageUtils';

interface SharedMedia {
  id: string;
  url: string;
  type: 'image' | 'file';
  name: string;
  size: number;
  created_at: string;
  sender_name: string;
}

interface UseSharedMediaOptions {
  channelId: string | null;
  enabled?: boolean;
}

export function useSharedMedia({ channelId, enabled = true }: UseSharedMediaOptions) {
  const [sharedMedia, setSharedMedia] = useState<SharedMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSharedMedia = async () => {
      if (!channelId || !enabled) {
        setSharedMedia([]);
        setLoading(false);
        return;
      }

      console.log('[useSharedMedia] Loading media for:', channelId);
      setLoading(true);
      setError(null);

      try {
        // Use the same function that works for messages
        const messages = await fetchChannelMessages(channelId);
        
        if (cancelled) {
          console.log('[useSharedMedia] Request cancelled');
          return;
        }

        console.log('[useSharedMedia] ✅ Got messages, filtering for media:', messages.length);
        
        const mediaItems: SharedMedia[] = [];
        
        messages.forEach((message: any) => {
          // Check for image field
          if (message.image) {
            mediaItems.push({
              id: `image-${message.id}`,
              url: message.image,
              type: 'image',
              name: 'Shared Image',
              size: 0,
              created_at: message.timestamp,
              sender_name: message.sender?.name || 'Unknown'
            });
          }

          // Check for attachments array
          if (message.attachments && Array.isArray(message.attachments)) {
            message.attachments.forEach((attachment: any, index: number) => {
              mediaItems.push({
                id: `attachment-${message.id}-${index}`,
                url: attachment.url,
                type: attachment.type?.startsWith('image/') ? 'image' : 'file',
                name: attachment.name || 'File',
                size: attachment.size || 0,
                created_at: message.timestamp,
                sender_name: message.sender?.name || 'Unknown'
              });
            });
          }

          // Check message content for image URLs (backup)
          if (message.content) {
            const imageUrlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg))/gi;
            const imageMatches = message.content.match(imageUrlRegex);
            
            if (imageMatches) {
              imageMatches.forEach((url: string, index: number) => {
                mediaItems.push({
                  id: `content-image-${message.id}-${index}`,
                  url: url,
                  type: 'image',
                  name: 'Image from message',
                  size: 0,
                  created_at: message.timestamp,
                  sender_name: message.sender?.name || 'Unknown'
                });
              });
            }
          }
        });
        
        // Remove duplicates and sort by date (newest first)
        const uniqueMedia = mediaItems.filter((item, index, arr) => 
          arr.findIndex(other => other.url === item.url) === index
        );
        
        uniqueMedia.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        setSharedMedia(uniqueMedia);
        setError(null);
        
        console.log('[useSharedMedia] ✅ Found media items:', uniqueMedia.length);
        
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load shared media';
          console.error('[useSharedMedia] ❌ Error:', errorMsg);
          setError(errorMsg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSharedMedia();

    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  return {
    sharedMedia,
    loading,
    error
  };
}