// app/dashboard/[id]/messages/_components/ChatSidebarSearch.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface ChatSidebarSearchProps {
  onSearchChange?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ChatSidebarSearch({ 
  onSearchChange,
  placeholder = "Search chats...",
  className = ""
}: ChatSidebarSearchProps) {
  // Internal state - manages its own search query
  const [searchQuery, setSearchQuery] = useState('');

  // Handle search changes
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    
    // Notify parent if callback provided
    if (onSearchChange) {
      onSearchChange(query);
    }
  }, [onSearchChange]);

  // Clear search
  const clearSearch = useCallback(() => {
    handleSearchChange('');
  }, [handleSearchChange]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSearchChange(e.target.value);
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  };

  return (
    <div className={`p-2 border-b border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-[hsl(var(--sidebar-foreground))] opacity-60" />
        </div>
        <input
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="w-full pl-8 pr-8 py-2 rounded-[var(--radius)] text-sm bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))] placeholder:text-[hsl(var(--sidebar-foreground))] placeholder:opacity-60 border-none focus:ring-2 focus:ring-[hsl(var(--sidebar-primary))] focus:outline-none transition-all duration-200"
          autoComplete="off"
          spellCheck="false"
        />
        {searchQuery && (
          <button
            className="absolute inset-y-0 right-0 pr-2 flex items-center hover:bg-[hsl(var(--sidebar-accent))] rounded-r-[var(--radius)] transition-colors duration-200"
            onClick={clearSearch}
            title="Clear search"
            type="button"
          >
            <X size={16} className="text-[hsl(var(--sidebar-foreground))] opacity-60 hover:opacity-100 transition-opacity duration-200" />
          </button>
        )}
      </div>
      
      {/* Optional: Show search results count or status */}
      {searchQuery && (
        <div className="mt-1 text-xs text-[hsl(var(--sidebar-foreground))] opacity-60">
          Searching for "{searchQuery}"
        </div>
      )}
    </div>
  );
}

// Export a hook for parent components to access search state if needed
export function useSearchQuery() {
  const [query, setQuery] = useState('');
  
  return {
    searchQuery: query,
    setSearchQuery: setQuery,
    clearSearch: () => setQuery(''),
    hasQuery: query.length > 0
  };
}