// app/dashboard/[id]/messages/_components/ActionsSection.tsx (WITH HOOKS)
'use client';

import { ChevronDown, ChevronRight, Search, Bell, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useChatDebugActions, useDebugLogger } from '@/hooks/useChatDebugActions';

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
  
  // Initialize debug hooks for backend automation
  const { addDebugLog } = useDebugLogger('ActionsSection');
  const { 
    clearCache, 
    forceFetch,
    cleanup 
  } = useChatDebugActions({
    // Pass minimal required props - the hooks will handle the automation
    currentUserId: null, // Will be auto-detected by the hook
    setConversations: () => {}, // Not used in this context
    setHasLoadedFromCache: () => {}, // Not used in this context
    setCacheInfo: () => {}, // Not used in this context
    setIsLoading: () => {}, // Not used in this context
    hasFetched: { current: false }, // Not used in this context
    lastFetchTime: { current: 0 }, // Not used in this context
    addDebugLog,
    debugLog: [], // Not used in this context
    setDebugLog: () => {}, // Not used in this context
    fetchFunction: () => Promise.resolve() // Not used in this context
  });
  
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

  // Enhanced delete conversation with hooks integration
  const handleDeleteConversation = async () => {
    // Enhanced validation and debugging
    addDebugLog(`Delete triggered with channelId: ${channelId}`);
    console.log('[ActionsSection] Delete triggered with channelId:', {
      channelId,
      type: typeof channelId,
      isString: typeof channelId === 'string',
      length: channelId?.length,
      value: channelId
    });

    if (!channelId) {
      toast.error('Cannot delete conversation - missing channel ID');
      addDebugLog('❌ No channelId provided');
      console.error('[ActionsSection] No channelId provided');
      return;
    }

    // Ensure channelId is a string
    const cleanChannelId = String(channelId).trim();
    
    if (!cleanChannelId || cleanChannelId === 'undefined' || cleanChannelId === 'null') {
      toast.error('Cannot delete conversation - invalid channel ID');
      addDebugLog(`❌ Invalid channelId: ${cleanChannelId}`);
      console.error('[ActionsSection] Invalid channelId:', cleanChannelId);
      return;
    }

    // UUID validation (optional but recommended)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanChannelId)) {
      toast.error('Cannot delete conversation - invalid channel ID format');
      addDebugLog(`❌ Invalid UUID format: ${cleanChannelId}`);
      console.error('[ActionsSection] Invalid UUID format:', cleanChannelId);
      return;
    }

    const action = isGroup ? 'leave this group' : 'delete this conversation';
    const actionPast = isGroup ? 'Left group' : 'Conversation deleted';
    
    const confirmed = window.confirm(
      `Are you sure you want to ${action}? This action cannot be undone and will delete all messages, attachments, and reactions.`
    );
    
    if (!confirmed) {
      addDebugLog('Delete cancelled by user');
      console.log('[ActionsSection] Delete cancelled by user');
      return;
    }

    try {
      setIsDeleting(true);
      addDebugLog(`🗑️ Starting delete for conversation: ${cleanChannelId}`);
      console.log(`[ActionsSection] Starting delete for conversation: ${cleanChannelId}`);
      
      const deleteUrl = `/api/messages/${cleanChannelId}/delete`;
      addDebugLog(`API URL: ${deleteUrl}`);
      console.log('[ActionsSection] Delete URL:', deleteUrl);
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      addDebugLog(`📡 Delete response status: ${response.status}`);
      console.log(`[ActionsSection] Delete response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        addDebugLog(`❌ API error: ${response.status} - ${errorText.slice(0, 100)}`);
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
      addDebugLog(`✅ Delete response data: ${JSON.stringify(data)}`);
      console.log('[ActionsSection] Delete response data:', data);

      if (data.success) {
        toast.success(`${actionPast} successfully`);
        addDebugLog(`✅ Delete successful, starting cleanup and refresh`);
        console.log('[ActionsSection] Delete successful, closing sidebar and notifying parent');
        
        // 🎯 USE HOOKS FOR CLEANUP AND REFRESH
        try {
          addDebugLog('🧹 Starting cache cleanup...');
          await cleanup(); // Clean up expired cache items
          
          addDebugLog('🗑️ Clearing conversation cache...');
          await clearCache(); // Clear all conversation cache
          
          addDebugLog('🔄 Forcing fresh fetch...');
          await forceFetch(); // Force fetch fresh data
          
          addDebugLog('✅ Cache cleanup and refresh completed');
          console.log('[ActionsSection] Cache cleanup and refresh completed');
          
        } catch (hookError) {
          addDebugLog(`⚠️ Hook operation warning: ${hookError instanceof Error ? hookError.message : 'Unknown'}`);
          console.warn('[ActionsSection] Hook operation warning:', hookError);
          // Don't fail the delete operation if hooks have issues
        }
        
        // Close the sidebar
        onClose();
        
        // Notify parent component about the deletion
        if (onConversationDeleted) {
          addDebugLog(`📢 Notifying parent about deletion: ${cleanChannelId}`);
          console.log('[ActionsSection] Calling onConversationDeleted with:', cleanChannelId);
          onConversationDeleted(cleanChannelId);
        }
        
        addDebugLog('✅ Delete operation completed successfully');
        
      } else {
        throw new Error(data.error || 'Failed to delete conversation - no success flag');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation - unknown error';
      addDebugLog(`❌ Delete error: ${errorMessage}`);
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