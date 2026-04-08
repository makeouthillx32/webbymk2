// app/dashboard/[id]/messages/_components/ActionsSection.tsx
'use client';

import { ChevronDown, ChevronRight, Search, Bell, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface ActionsSectionProps {
  isGroup: boolean;
  isCollapsed: boolean;
  channelId?: string;
  onToggle: () => void;
  onConversationDeleted?: (channelId: string) => void;
  onClose: () => void;
}

export default function ActionsSection({ 
  isGroup, 
  isCollapsed, 
  channelId,
  onToggle, 
  onConversationDeleted,
  onClose
}: ActionsSectionProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Action handlers
  const handleSearchInConversation = () => {
    toast.success('Search functionality coming soon!');
  };

  const handleNotificationSettings = () => {
    toast.success('Notification settings coming soon!');
  };

  const handleAddParticipants = () => {
    toast.success('Add participants functionality coming soon!');
  };

  // Enhanced delete conversation with better UX
  const handleDeleteConversation = async () => {
    if (!channelId) {
      toast.error('Cannot delete conversation - missing channel ID');
      console.error('[ActionsSection] No channelId provided');
      return;
    }

    const action = isGroup ? 'leave this group' : 'delete this conversation';
    const actionPast = isGroup ? 'Left group' : 'Conversation deleted';
    
    const confirmed = window.confirm(
      `Are you sure you want to ${action}? This action cannot be undone and will delete all messages, attachments, and reactions.`
    );
    
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      console.log(`[ActionsSection] Deleting conversation: ${channelId}`);
      
      const response = await fetch(`/api/messages/${channelId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      console.log(`[ActionsSection] Delete response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ActionsSection] Delete API error: ${response.status} - ${errorText}`);
        
        let errorMessage = `Failed to delete conversation (${response.status})`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          errorMessage = `Server error: ${response.status} - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('[ActionsSection] Delete response data:', data);

      if (data.success) {
        toast.success(`${actionPast} successfully`);
        console.log('[ActionsSection] Delete successful, closing sidebar and notifying parent');
        
        // Close the sidebar first
        onClose();
        
        // Notify parent component about the deletion
        if (onConversationDeleted) {
          onConversationDeleted(channelId);
        }
      } else {
        throw new Error(data.error || 'Failed to delete conversation - no success flag');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation - unknown error';
      console.error('[ActionsSection] Delete conversation error:', error);
      toast.error(`Delete failed: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Reusable button style function
  const getActionButtonStyle = (isDestructive = false, disabled = false) => ({
    width: '100%',
    padding: '8px 12px',
    textAlign: 'left' as const,
    borderRadius: 'var(--radius)',
    background: 'transparent',
    border: 'none',
    color: isDestructive ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background-color 0.2s ease',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    opacity: disabled ? 0.6 : 1
  });

  const handleActionButtonHover = (e: React.MouseEvent<HTMLButtonElement>, isDestructive = false, disabled = false) => {
    if (!disabled) {
      e.currentTarget.style.backgroundColor = isDestructive 
        ? 'hsl(var(--destructive) / 0.1)' 
        : 'hsl(var(--accent))';
    }
  };

  const handleActionButtonLeave = (e: React.MouseEvent<HTMLButtonElement>, disabled = false) => {
    if (!disabled) {
      e.currentTarget.style.backgroundColor = 'transparent';
    }
  };

  return (
    <div style={{
      borderBottom: '1px solid hsl(var(--border))',
      backgroundColor: 'hsl(var(--card))',
      flexShrink: 0
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: 'hsl(var(--foreground))',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--accent) / 0.5)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        aria-expanded={!isCollapsed}
        aria-label="Toggle actions section"
      >
        <span>Actions</span>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      
      {!isCollapsed && (
        <div style={{ padding: '0 16px 12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button 
              onClick={handleSearchInConversation}
              style={getActionButtonStyle()}
              onMouseEnter={(e) => handleActionButtonHover(e)}
              onMouseLeave={(e) => handleActionButtonLeave(e)}
              aria-label="Search in conversation"
            >
              <Search size={14} />
              Search in conversation
            </button>
            
            <button 
              onClick={handleNotificationSettings}
              style={getActionButtonStyle()}
              onMouseEnter={(e) => handleActionButtonHover(e)}
              onMouseLeave={(e) => handleActionButtonLeave(e)}
              aria-label="Notification settings"
            >
              <Bell size={14} />
              Notification settings
            </button>
            
            {isGroup && (
              <button 
                onClick={handleAddParticipants}
                style={getActionButtonStyle()}
                onMouseEnter={(e) => handleActionButtonHover(e)}
                onMouseLeave={(e) => handleActionButtonLeave(e)}
                aria-label="Add participants to group"
              >
                <UserPlus size={14} />
                Add participants
              </button>
            )}
            
            <button 
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              style={getActionButtonStyle(true, isDeleting)}
              onMouseEnter={(e) => handleActionButtonHover(e, true, isDeleting)}
              onMouseLeave={(e) => handleActionButtonLeave(e, isDeleting)}
              aria-label={isGroup ? 'Leave group' : 'Delete conversation'}
            >
              {isDeleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              {isDeleting ? 'Deleting...' : (isGroup ? 'Leave group' : 'Delete conversation')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}