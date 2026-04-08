'use client';
import React, { useState, useCallback } from 'react';
import { 
  StarIcon,
  FolderIcon,
  HomeIcon,
  RecentIcon,
  TrashIcon,
  SharedIcon,
  ChevronDownIcon,
  PlusIcon,
  CloseIcon,
  PinIcon
} from './icons';

interface FavoriteItem {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'shortcut';
  isPinned?: boolean;
  created_at: string;
}

interface FavoritesBarProps {
  favorites: FavoriteItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onAddFavorite?: (path: string, name: string) => void;
  onRemoveFavorite?: (favoriteId: string) => void;
  onTogglePin?: (favoriteId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export default function FavoritesBar({
  favorites,
  currentPath,
  onNavigate,
  onAddFavorite,
  onRemoveFavorite,
  onTogglePin,
  isCollapsed = false,
  onToggleCollapse,
  className = ''
}: FavoritesBarProps) {
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const quickAccessItems = [
    {
      id: 'home',
      name: 'Home',
      path: '',
      icon: HomeIcon,
      type: 'shortcut' as const
    },
    {
      id: 'recent',
      name: 'Recent',
      path: '/recent',
      icon: RecentIcon,
      type: 'shortcut' as const
    },
    {
      id: 'shared',
      name: 'Shared',
      path: '/shared',
      icon: SharedIcon,
      type: 'shortcut' as const
    },
    {
      id: 'trash',
      name: 'Trash',
      path: '/trash',
      icon: TrashIcon,
      type: 'shortcut' as const
    }
  ];

  const pinnedFavorites = favorites.filter(fav => fav.isPinned);
  const regularFavorites = favorites.filter(fav => !fav.isPinned);
  const visibleFavorites = showAllFavorites ? regularFavorites : regularFavorites.slice(0, 3);

  const handleFavoriteClick = useCallback((path: string) => {
    onNavigate(path);
  }, [onNavigate]);

  const handleRemoveFavorite = useCallback((e: React.MouseEvent, favoriteId: string) => {
    e.stopPropagation();
    onRemoveFavorite?.(favoriteId);
  }, [onRemoveFavorite]);

  const handleTogglePin = useCallback((e: React.MouseEvent, favoriteId: string) => {
    e.stopPropagation();
    onTogglePin?.(favoriteId);
  }, [onTogglePin]);

  const truncateName = (name: string, maxLength: number = 15) => {
    if (name.length <= maxLength) return name;
    return name.substring(0, maxLength) + '...';
  };

  if (isCollapsed) {
    return (
      <div className={`favorites-bar-collapsed ${className}`}>
        <div className="flex flex-col gap-2 p-2">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Expand favorites"
            >
              <ChevronDownIcon className="h-4 w-4 rotate-90" />
            </button>
          )}

          {quickAccessItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentPath === item.path;
            
            return (
              <button
                key={item.id}
                onClick={() => handleFavoriteClick(item.path)}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={item.name}
              >
                <IconComponent className="h-5 w-5" />
              </button>
            );
          })}

          {pinnedFavorites.slice(0, 3).map((favorite) => {
            const isActive = currentPath === favorite.path;
            
            return (
              <button
                key={favorite.id}
                onClick={() => handleFavoriteClick(favorite.path)}
                className={`p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                title={favorite.name}
              >
                <FolderIcon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`favorites-bar bg-background border-r border-border ${className}`}>
      
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <StarIcon className="h-5 w-5 text-primary" />
          <h3 className="font-medium text-foreground">Favorites</h3>
        </div>
        
        <div className="flex items-center gap-1">
          {onAddFavorite && (
            <button
              onClick={() => {
                const folderName = prompt('Enter folder name:');
                if (folderName) {
                  onAddFavorite(currentPath, folderName);
                }
              }}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Add current folder to favorites"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          )}
          
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              title="Collapse favorites"
            >
              <ChevronDownIcon className="h-4 w-4 -rotate-90" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Quick Access
        </h4>
        
        <div className="space-y-1">
          {quickAccessItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentPath === item.path;
            
            return (
              <button
                key={item.id}
                onClick={() => handleFavoriteClick(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <IconComponent className="h-4 w-4 flex-shrink-0" />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {pinnedFavorites.length > 0 && (
        <div className="px-3 pb-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Pinned
          </h4>
          
          <div className="space-y-1">
            {pinnedFavorites.map((favorite) => {
              const isActive = currentPath === favorite.path;
              const isHovered = hoveredItem === favorite.id;
              
              return (
                <div
                  key={favorite.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredItem(favorite.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <button
                    onClick={() => handleFavoriteClick(favorite.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="relative">
                      <FolderIcon className="h-4 w-4 flex-shrink-0" />
                      <PinIcon className="absolute -top-1 -right-1 h-3 w-3 text-primary" />
                    </div>
                    <span className="truncate" title={favorite.name}>
                      {truncateName(favorite.name)}
                    </span>
                  </button>

                  {isHovered && (
                    <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex gap-1">
                      <button
                        onClick={(e) => handleTogglePin(e, favorite.id)}
                        className="p-1 text-muted-foreground hover:text-foreground bg-background rounded shadow-sm"
                        title="Unpin"
                      >
                        <PinIcon className="h-3 w-3" />
                      </button>
                      
                      <button
                        onClick={(e) => handleRemoveFavorite(e, favorite.id)}
                        className="p-1 text-muted-foreground hover:text-destructive bg-background rounded shadow-sm"
                        title="Remove"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {regularFavorites.length > 0 && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Folders
            </h4>
            
            {regularFavorites.length > 3 && (
              <button
                onClick={() => setShowAllFavorites(!showAllFavorites)}
                className="text-xs text-primary hover:underline"
              >
                {showAllFavorites ? 'Show Less' : `+${regularFavorites.length - 3} more`}
              </button>
            )}
          </div>
          
          <div className="space-y-1">
            {visibleFavorites.map((favorite) => {
              const isActive = currentPath === favorite.path;
              const isHovered = hoveredItem === favorite.id;
              
              return (
                <div
                  key={favorite.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredItem(favorite.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <button
                    onClick={() => handleFavoriteClick(favorite.path)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <FolderIcon className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="truncate" title={favorite.name}>
                      {truncateName(favorite.name)}
                    </span>
                  </button>

                  {isHovered && (
                    <div className="absolute right-1 top-1/2 transform -translate-y-1/2 flex gap-1">
                      <button
                        onClick={(e) => handleTogglePin(e, favorite.id)}
                        className="p-1 text-muted-foreground hover:text-primary bg-background rounded shadow-sm"
                        title="Pin to top"
                      >
                        <PinIcon className="h-3 w-3" />
                      </button>
                      
                      <button
                        onClick={(e) => handleRemoveFavorite(e, favorite.id)}
                        className="p-1 text-muted-foreground hover:text-destructive bg-background rounded shadow-sm"
                        title="Remove"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {favorites.length === 0 && (
        <div className="px-3 pb-3">
          <div className="text-center py-8">
            <StarIcon className="h-8 w-8 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              No favorite folders yet
            </p>
            <p className="text-xs text-muted-foreground">
              Star folders to add them here
            </p>
          </div>
        </div>
      )}

      {onAddFavorite && currentPath && (
        <div className="border-t border-border p-3 mt-auto">
          <button
            onClick={() => {
              const folderName = currentPath.split('/').filter(Boolean).pop() || 'Root';
              onAddFavorite(currentPath, folderName);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg transition-colors"
          >
            <StarIcon className="h-4 w-4" />
            <span>Add to Favorites</span>
          </button>
        </div>
      )}
    </div>
  );
}