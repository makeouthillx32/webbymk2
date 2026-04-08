'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, Users, UserCircle } from 'lucide-react';
import { Conversation } from './ChatSidebar';
import './NewChatModal.scss';

interface User {
  id: string;
  display_name: string | null;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConversationCreated: (conversation: Conversation) => void;
}

export default function NewChatModal({ isOpen, onClose, onConversationCreated }: NewChatModalProps) {
  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [selectedDMUser, setSelectedDMUser] = useState<User | null>(null); // Single user for DM
  const [groupName, setGroupName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch current user ID
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          setCurrentUserId(data.id);
        }
      } catch (err) {
        console.error('Error fetching current user:', err);
      }
    };

    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  useEffect(() => {
    // Focus search input when modal opens
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }

    // Reset state when modal opens
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
      setSelectedDMUser(null);
      setGroupName('');
      setError(null);
    }
  }, [isOpen]);

  // Reset selections when mode changes
  useEffect(() => {
    setSelectedUsers([]);
    setSelectedDMUser(null);
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
  }, [mode]);

  // Handle clicks outside the modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle search query
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`/api/get-all-users?search=${encodeURIComponent(searchQuery)}`);
        
        if (!response.ok) {
          throw new Error('Failed to search users');
        }
        
        const users = await response.json();
        
        // Filter logic depends on mode
        let filteredUsers;
        if (mode === 'dm') {
          // For DM: exclude current user only (don't exclude selected user so it can be changed)
          filteredUsers = users.filter((user: User) => user.id !== currentUserId);
        } else {
          // For group: exclude current user and already selected users
          filteredUsers = users.filter(
            (user: User) => 
              !selectedUsers.some(selected => selected.id === user.id) && 
              user.id !== currentUserId
          );
        }
        
        setSearchResults(filteredUsers);
      } catch (err) {
        console.error('Error searching users:', err);
        setError('Failed to search users');
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimeout = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers();
      }
    }, 300);

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery, selectedUsers, currentUserId, mode]);

  const handleSelectUser = (user: User) => {
    if (mode === 'dm') {
      // For DM: select only one user and immediately create conversation
      setSelectedDMUser(user);
      // Don't clear search - let user see their selection
      setSearchQuery(user.display_name || 'User');
      setSearchResults([]);
    } else {
      // For group: check if user is already selected
      if (selectedUsers.some(selected => selected.id === user.id)) {
        return;
      }
      
      // Add to selected users
      setSelectedUsers(prev => [...prev, user]);
      setSearchQuery('');
      // Update search results to remove the selected user
      setSearchResults(prev => prev.filter(result => result.id !== user.id));
    }
  };

  const handleRemoveUser = (userId: string) => {
    if (mode === 'group') {
      setSelectedUsers(prev => prev.filter(user => user.id !== userId));
    }
    // Note: No remove function for DM mode since we don't show selected users
  };

  const handleCreateConversation = async () => {
    if (mode === 'dm') {
      if (!selectedDMUser) {
        setError('Please select a user to start a DM');
        return;
      }

      try {
        setIsLoading(true);
        
        const response = await fetch('/api/messages/start-dm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userIds: [selectedDMUser.id],
          }),
          credentials: 'include',
        });

        const responseText = await response.text();
        
        if (!response.ok) {
          throw new Error(`Failed to create DM: ${response.status} ${responseText}`);
        }

        let channelId;
        try {
          const data = JSON.parse(responseText);
          channelId = data;
        } catch (e) {
          channelId = responseText;
        }
        
        const newConversation: Conversation = {
          id: channelId,
          channel_id: channelId,
          channel_name: selectedDMUser.display_name || 'User',
          is_group: false,
          last_message: null,
          last_message_at: null,
          unread_count: 0,
          participants: [
            {
              user_id: currentUserId || '',
              display_name: 'You',
              avatar_url: '',
              email: '',
              online: true
            },
            {
              user_id: selectedDMUser.id,
              display_name: selectedDMUser.display_name || 'User',
              avatar_url: '',
              email: '',
              online: false
            }
          ]
        };
        
        onConversationCreated(newConversation);
        onClose();
      } catch (err) {
        console.error('Error creating DM:', err);
        setError('Failed to create conversation: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsLoading(false);
      }
    } else {
      // Group chat logic
      if (selectedUsers.length === 0) {
        setError('Please select at least one user for the group');
        return;
      }

      if (!groupName.trim()) {
        setError('Please enter a group name');
        return;
      }

      try {
        setIsLoading(true);
        
        const response = await fetch('/api/messages/start-group', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: groupName,
            participantIds: selectedUsers.map(user => user.id),
          }),
          credentials: 'include',
        });

        const responseText = await response.text();
        
        if (!response.ok) {
          throw new Error(`Failed to create group: ${response.status} ${responseText}`);
        }

        let channelId;
        try {
          const data = JSON.parse(responseText);
          channelId = data.channelId || data;
        } catch (e) {
          console.error("Error parsing response:", e);
          throw new Error("Invalid response format from server");
        }
        
        const newConversation: Conversation = {
          id: channelId,
          channel_id: channelId,
          channel_name: groupName,
          is_group: true,
          last_message: null,
          last_message_at: null,
          unread_count: 0,
          participants: [
            {
              user_id: currentUserId || '',
              display_name: 'You',
              avatar_url: '',
              email: '',
              online: true
            },
            ...selectedUsers.map(user => ({
              user_id: user.id,
              display_name: user.display_name || 'User',
              avatar_url: '',
              email: '',
              online: false
            }))
          ]
        };
        
        onConversationCreated(newConversation);
        onClose();
      } catch (err) {
        console.error('Error creating group chat:', err);
        setError('Failed to create group conversation: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  // Validation logic
  const isValid = mode === 'dm' ? selectedDMUser !== null : selectedUsers.length > 0 && groupName.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 p-4 flex items-center justify-center" style={{
      backgroundColor: 'rgba(0, 0, 0, 0.5)'
    }}>
      <div 
        ref={modalRef}
        className="w-full max-w-md max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-xl)'
        }}
      >
        {/* Header */}
        <div className="p-4 flex justify-between items-center" style={{
          borderBottom: '1px solid hsl(var(--border))'
        }}>
          <h2 className="text-lg font-semibold" style={{
            color: 'hsl(var(--card-foreground))'
          }}>New Conversation</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded"
            style={{
              color: 'hsl(var(--muted-foreground))',
              borderRadius: 'var(--radius)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'hsl(var(--foreground))';
              e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Mode Toggle */}
          <div className="flex mb-4 overflow-hidden" style={{
            backgroundColor: 'hsl(var(--muted))',
            borderRadius: 'var(--radius)'
          }}>
            <button
              className="flex-1 py-2 text-center transition-colors"
              style={{
                backgroundColor: mode === 'dm' ? 'hsl(var(--primary))' : 'transparent',
                color: mode === 'dm' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                borderRadius: 'calc(var(--radius) - 2px)'
              }}
              onClick={() => setMode('dm')}
              onMouseEnter={(e) => {
                if (mode !== 'dm') {
                  e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
                  e.currentTarget.style.color = 'hsl(var(--accent-foreground))';
                }
              }}
              onMouseLeave={(e) => {
                if (mode !== 'dm') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
                }
              }}
            >
              <UserCircle size={16} className="inline mr-2" />
              Direct Message
            </button>
            <button
              className="flex-1 py-2 text-center transition-colors"
              style={{
                backgroundColor: mode === 'group' ? 'hsl(var(--primary))' : 'transparent',
                color: mode === 'group' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                borderRadius: 'calc(var(--radius) - 2px)'
              }}
              onClick={() => setMode('group')}
              onMouseEnter={(e) => {
                if (mode !== 'group') {
                  e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
                  e.currentTarget.style.color = 'hsl(var(--accent-foreground))';
                }
              }}
              onMouseLeave={(e) => {
                if (mode !== 'group') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
                }
              }}
            >
              <Users size={16} className="inline mr-2" />
              Group Chat
            </button>
          </div>

          {/* Group Name Input (only for group mode) */}
          {mode === 'group' && (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Group Name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full p-3"
                style={{
                  backgroundColor: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  outline: 'none'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(var(--ring))';
                  e.currentTarget.style.boxShadow = '0 0 0 2px hsl(var(--ring) / 0.2)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(var(--border))';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          )}

          {/* Selected Users (ONLY show for group mode) */}
          {mode === 'group' && selectedUsers.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium mb-2" style={{ color: 'hsl(var(--foreground))' }}>
                Selected Users:
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(user => (
                  <div 
                    key={user.id}
                    className="px-3 py-1 flex items-center text-sm"
                    style={{
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      color: 'hsl(var(--primary))',
                      borderRadius: '9999px',
                      border: '1px solid hsl(var(--primary) / 0.2)'
                    }}
                  >
                    <span>{user.display_name || 'User'}</span>
                    <button 
                      onClick={() => handleRemoveUser(user.id)}
                      className="ml-2 p-0.5"
                      style={{
                        color: 'hsl(var(--primary))',
                        borderRadius: '50%'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'hsl(var(--primary) / 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder={mode === 'dm' ? "Search for a user..." : "Add people to group..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3"
              style={{
                backgroundColor: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 'var(--radius)',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--ring))';
                e.currentTarget.style.boxShadow = '0 0 0 2px hsl(var(--ring) / 0.2)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'hsl(var(--border))';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Search Results */}
          <div className="max-h-60 overflow-y-auto mb-4">
            {isLoading ? (
              <div className="text-center py-4" style={{
                color: 'hsl(var(--muted-foreground))'
              }}>
                <div className="animate-pulse">Searching...</div>
              </div>
            ) : searchQuery && searchResults.length === 0 ? (
              <div className="text-center py-4" style={{
                color: 'hsl(var(--muted-foreground))'
              }}>
                No users found for "{searchQuery}"
              </div>
            ) : (
              searchResults.map(user => (
                <div
                  key={user.id}
                  className="p-3 cursor-pointer flex items-center transition-colors"
                  style={{
                    borderRadius: 'var(--radius)',
                    // Highlight selected DM user
                    backgroundColor: mode === 'dm' && selectedDMUser?.id === user.id ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                    border: mode === 'dm' && selectedDMUser?.id === user.id ? '1px solid hsl(var(--primary) / 0.3)' : '1px solid transparent'
                  }}
                  onClick={() => handleSelectUser(user)}
                  onMouseEnter={(e) => {
                    if (!(mode === 'dm' && selectedDMUser?.id === user.id)) {
                      e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!(mode === 'dm' && selectedDMUser?.id === user.id)) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mr-3" style={{
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))'
                  }}>
                    {(user.display_name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium" style={{
                      color: 'hsl(var(--card-foreground))'
                    }}>
                      {user.display_name || 'User'}
                    </div>
                    {mode === 'dm' && selectedDMUser?.id === user.id && (
                      <div className="text-xs" style={{
                        color: 'hsl(var(--primary))'
                      }}>
                        Selected for DM
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm mb-4 p-3" style={{
              color: 'hsl(var(--destructive))',
              backgroundColor: 'hsl(var(--destructive) / 0.1)',
              border: '1px solid hsl(var(--destructive) / 0.2)',
              borderRadius: 'var(--radius)'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 flex justify-end gap-3" style={{
          borderTop: '1px solid hsl(var(--border))'
        }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 transition-colors"
            style={{
              color: 'hsl(var(--muted-foreground))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'hsl(var(--accent))';
                e.currentTarget.style.color = 'hsl(var(--accent-foreground))';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
              }
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateConversation}
            disabled={!isValid || isLoading}
            className="px-6 py-2 transition-colors"
            style={{
              backgroundColor: (!isValid || isLoading) ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
              color: (!isValid || isLoading) ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))',
              borderRadius: 'var(--radius)',
              cursor: (!isValid || isLoading) ? 'not-allowed' : 'pointer',
              border: 'none'
            }}
            onMouseEnter={(e) => {
              if (isValid && !isLoading) {
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              if (isValid && !isLoading) {
                e.currentTarget.style.opacity = '1';
              }
            }}
          >
            {isLoading ? 'Creating...' : mode === 'dm' ? 'Start Chat' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}