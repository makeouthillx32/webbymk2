'use client';
import React, { useState, useCallback } from 'react';
import { 
  SearchIcon,
  PlusIcon,
  UploadIcon,
  GridIcon,
  ListIcon,
  FilterIcon,
  SortIcon,
  MoreIcon,
  FolderIcon,
  StarIcon,
  ShareIcon,
  RefreshIcon
} from './icons';

type ViewMode = 'grid' | 'list';
type SortOption = 'name' | 'date' | 'size' | 'type';
type SortOrder = 'asc' | 'desc';

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onUpload: () => void;
  onCreateFolder: () => void;
  onRefresh?: () => void;
  sortBy: SortOption;
  sortOrder: SortOrder;
  onSortChange: (sortBy: SortOption, order: SortOrder) => void;
  showFavoritesOnly: boolean;
  onToggleFavorites: () => void;
  selectedCount: number;
  onClearSelection?: () => void;
  onSelectAll?: () => void;
  isUploading?: boolean;
  isLoading?: boolean;
  className?: string;
}

export default function Toolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search documents...",
  viewMode,
  onViewModeChange,
  onUpload,
  onCreateFolder,
  onRefresh,
  sortBy,
  sortOrder,
  onSortChange,
  showFavoritesOnly,
  onToggleFavorites,
  selectedCount,
  onClearSelection,
  onSelectAll,
  isUploading = false,
  isLoading = false,
  className = ''
}: ToolbarProps) {
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUploadTooltip, setShowUploadTooltip] = useState(false);

  const sortOptions = [
    { value: 'name' as SortOption, label: 'Name' },
    { value: 'date' as SortOption, label: 'Date Modified' },
    { value: 'size' as SortOption, label: 'Size' },
    { value: 'type' as SortOption, label: 'Type' }
  ];

  const handleSortSelect = useCallback((newSortBy: SortOption) => {
    const newOrder = sortBy === newSortBy && sortOrder === 'asc' ? 'desc' : 'asc';
    onSortChange(newSortBy, newOrder);
    setShowSortMenu(false);
  }, [sortBy, sortOrder, onSortChange]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value);
  }, [onSearchChange]);

  const clearSearch = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  // Fixed: Wrap the handlers to prevent event objects from being passed
  const handleCreateFolder = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onCreateFolder();
  }, [onCreateFolder]);

  const handleUpload = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onUpload();
  }, [onUpload]);

  return (
    <div className={`toolbar bg-background border border-border rounded-lg shadow-sm ${className}`}>
      
      {/* Mobile Layout */}
      <div className="block sm:hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                isUploading
                  ? 'bg-primary/60 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90'
              } text-primary-foreground`}
              title="Upload files or drag & drop anywhere"
            >
              <UploadIcon className="h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>

            <button
              onClick={handleCreateFolder}
              className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
              title="New folder"
            >
              <FolderIcon className="h-4 w-4" />
              Folder
            </button>

            <div className="flex items-center bg-muted rounded-lg p-1 flex-shrink-0">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Grid view"
              >
                <GridIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="List view"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={onToggleFavorites}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                showFavoritesOnly
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <StarIcon className={`h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
              Favorites
            </button>

            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors whitespace-nowrap"
                title="Sort options"
              >
                <SortIcon className="h-4 w-4" />
                Sort
              </button>

              {showSortMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
                  <div className="p-2">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleSortSelect(option.value)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                          sortBy === option.value
                            ? 'bg-accent text-accent-foreground'
                            : 'text-popover-foreground hover:bg-muted'
                        }`}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                          <span className="text-xs">
                            {sortOrder === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                title="Refresh"
              >
                <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}

            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                title="More options"
              >
                <MoreIcon className="h-4 w-4" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-50">
                  <div className="p-2">
                    {onSelectAll && (
                      <button
                        onClick={() => {
                          onSelectAll();
                          setShowMoreMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                      >
                        Select All
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                    >
                      Export Selection
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                    >
                      <ShareIcon className="h-4 w-4" />
                      Share Folder
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:block">
        <div className="flex items-center justify-between p-4">
          
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={onToggleFavorites}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  showFavoritesOnly
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <StarIcon className={`h-4 w-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                <span className="hidden md:inline">Favorites</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => onViewModeChange('grid')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Grid view"
              >
                <GridIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="List view"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                title="Sort options"
              >
                <SortIcon className="h-4 w-4" />
                <span className="hidden lg:inline text-sm">Sort</span>
              </button>

              {showSortMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-10">
                  <div className="p-2">
                    {sortOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleSortSelect(option.value)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                          sortBy === option.value
                            ? 'bg-accent text-accent-foreground'
                            : 'text-popover-foreground hover:bg-muted'
                        }`}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                          <span className="text-xs">
                            {sortOrder === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowFilterMenu(!showFilterMenu)}
                className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                title="Filter options"
              >
                <FilterIcon className="h-4 w-4" />
                <span className="hidden lg:inline text-sm">Filter</span>
              </button>

              {showFilterMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-popover border border-border rounded-lg shadow-lg z-10">
                  <div className="p-3">
                    <h4 className="text-sm font-medium text-popover-foreground mb-3">Filter by</h4>
                    
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={showFavoritesOnly}
                          onChange={onToggleFavorites}
                          className="rounded border-border text-primary focus:ring-ring"
                        />
                        <span className="ml-2 text-sm text-popover-foreground">
                          Favorites only
                        </span>
                      </label>
                      
                      <div className="border-t border-border pt-2">
                        <p className="text-xs text-muted-foreground mb-2">File Types</p>
                        <div className="space-y-1">
                          {['Images', 'Documents', 'Videos', 'Archives'].map((type) => (
                            <label key={type} className="flex items-center">
                              <input
                                type="checkbox"
                                className="rounded border-border text-primary focus:ring-ring"
                              />
                              <span className="ml-2 text-sm text-popover-foreground">
                                {type}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}

            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                title="More options"
              >
                <MoreIcon className="h-4 w-4" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-10">
                  <div className="p-2">
                    {onSelectAll && (
                      <button
                        onClick={() => {
                          onSelectAll();
                          setShowMoreMenu(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                      >
                        Select All
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                    >
                      Export Selection
                    </button>
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground hover:bg-muted rounded-md"
                    >
                      <ShareIcon className="h-4 w-4" />
                      Share Folder
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
              <button
                onClick={handleCreateFolder}
                className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                title="New folder"
              >
                <FolderIcon className="h-4 w-4" />
                <span className="hidden xl:inline text-sm">New Folder</span>
              </button>

              {/* Enhanced Upload Button with Tooltip */}
              <div className="relative">
                <button
                  onClick={handleUpload}
                  onMouseEnter={() => setShowUploadTooltip(true)}
                  onMouseLeave={() => setShowUploadTooltip(false)}
                  disabled={isUploading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                    isUploading
                      ? 'bg-primary/60 cursor-not-allowed'
                      : 'bg-primary hover:bg-primary/90 hover:shadow-md'
                  } text-primary-foreground`}
                  title="Upload files"
                >
                  <UploadIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </span>
                </button>

                {/* Tooltip with drag & drop hint */}
                {showUploadTooltip && !isUploading && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 pointer-events-none">
                    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                      <div className="text-sm text-popover-foreground">
                        <p className="font-medium mb-1">Quick Upload</p>
                        <p className="text-xs text-muted-foreground">
                          Click to browse files or drag & drop anywhere on the page
                        </p>
                      </div>
                      {/* Arrow */}
                      <div className="absolute top-full right-4 -mt-1">
                        <div className="w-2 h-2 bg-popover border-r border-b border-border transform rotate-45"></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selection Bar */}
      {selectedCount > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
              </span>
              {onClearSelection && (
                <button
                  onClick={onClearSelection}
                  className="text-sm text-primary hover:underline"
                >
                  Clear selection
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded transition-colors whitespace-nowrap">
                <ShareIcon className="h-4 w-4" />
                Share
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded transition-colors whitespace-nowrap">
                <StarIcon className="h-4 w-4" />
                Favorite
              </button>
              <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded transition-colors whitespace-nowrap">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close menu overlay */}
      {(showSortMenu || showFilterMenu || showMoreMenu) && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => {
            setShowSortMenu(false);
            setShowFilterMenu(false);
            setShowMoreMenu(false);
          }}
        />
      )}
    </div>
  );
}