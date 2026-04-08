// hooks/useDeleteConversation.ts
import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface DeleteConversationResult {
  success: boolean;
  message?: string;
  channelId?: string;
  channelName?: string;
}

export const useDeleteConversation = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteConversation = async (channelId: string): Promise<DeleteConversationResult> => {
    setIsDeleting(true);
    
    try {
      const response = await fetch(`/api/messages/${channelId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete conversation');
      }

      if (data.success) {
        toast.success(`Conversation "${data.channelName}" deleted successfully`);
        return {
          success: true,
          message: data.message,
          channelId: data.channelId,
          channelName: data.channelName
        };
      } else {
        throw new Error(data.error || 'Failed to delete conversation');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation';
      toast.error(errorMessage);
      console.error('Delete conversation error:', error);
      
      return {
        success: false,
        message: errorMessage
      };
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    deleteConversation,
    isDeleting
  };
};