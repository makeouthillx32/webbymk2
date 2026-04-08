// components/documents/Folder/index.tsx - ENHANCED WITH PUBLIC FOLDER FEATURES
'use client';

import React, { useState, useEffect } from 'react';
import {
  FolderIcon,
  StarIcon,
  StarFilledIcon,
  MoreVerticalIcon
} from './icons';
import { 
  Globe, 
  Lock, 
  Copy, 
  Code, 
  Eye,
  Link 
} from 'lucide-react';
import './styles.scss';

interface FolderProps {
  folder: {
    id: string;
    name: string;
    path: string;
    type: 'folder';
    is_favorite: boolean;
    is_public_folder?: boolean;
    public_slug?: string;
    fileCount?: number;
  };
  viewMode: 'grid' | 'list';
  isSelected: boolean;
  isFavorite: boolean;
  index?: number;
  chartColorClass?: string;
  
  // Public folder actions
  onMakePublic?: (folderId: string, folderName: string) => void;
  onMakePrivate?: (folderId: string) => void;
  onCopyPublicUrl?: (publicSlug: string) => void;
  onViewPublicAssets?: (publicSlug: string) => void;
  onGenerateCode?: (publicSlug: string) => void;
  
  // Regular folder actions
  onNavigate: (path: string) => void;
  onToggleFavorite: (path: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onSelect: (id: string, isMulti: boolean) => void;
}

export default function Folder({
  folder,
  viewMode,
  isSelected,
  isFavorite,
  index = 0,
  chartColorClass,
  onMakePublic,
  onMakePrivate,
  onCopyPublicUrl,
  onViewPublicAssets,
  onGenerateCode,
  onNavigate,
  onToggleFavorite,
  onContextMenu,
  onSelect
}: FolderProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [showPublicMenu, setShowPublicMenu] = useState(false);

  const fileCount = folder.fileCount ?? 0;
  const paperLayers = Math.min(Math.max(fileCount, 1), 5);
  const isEmpty = fileCount === 0;
  const chartClass = chartColorClass || `chart-${(index % 5) + 1}`;
  const isPublic = folder.is_public_folder || false;

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof window !== "undefined") {
        const style = getComputedStyle(document.documentElement);
        const chartNumber = chartClass.replace('chart-', '');
        const chartVar = style.getPropertyValue(`--chart-${chartNumber}`).trim();
        if (chartVar) setThemeReady(true);
        else setTimeout(checkTheme, 50);
      }
    };
    checkTheme();
  }, [chartClass]);

  // Event handlers
  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.folder-actions')) return;
    
    if (e.ctrlKey || e.metaKey) {
      onSelect(folder.id, true);
      return;
    }

    if (!isClicked) {
      setIsClicked(true);
      return;
    }

    onNavigate(folder.path);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsClicked(false);
    setShowPublicMenu(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, folder.id);
  };

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(folder.path, folder.name);
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onContextMenu(e, folder.id);
  };

  // Public folder handlers
  const handlePublicToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPublic) {
      if (confirm('Make this folder private? Images will no longer be publicly accessible.')) {
        onMakePrivate?.(folder.id);
      }
    } else {
      onMakePublic?.(folder.id, folder.name);
    }
    setShowPublicMenu(false);
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (folder.public_slug) {
      onCopyPublicUrl?.(folder.public_slug);
    }
    setShowPublicMenu(false);
  };

  const handleViewAssets = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (folder.public_slug) {
      onViewPublicAssets?.(folder.public_slug);
    }
    setShowPublicMenu(false);
  };

  const handleGenerateCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (folder.public_slug) {
      onGenerateCode?.(folder.public_slug);
    }
    setShowPublicMenu(false);
  };

  // List view
  if (viewMode === 'list') {
    return (
      <div
        className={`folder-list-item ${chartClass} ${isSelected ? 'selected' : ''} ${isPublic ? 'public' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div className="folder-list-content">
          <div className="folder-list-icon">
            <FolderIcon />
            {isPublic && (
              <div className="public-indicator">
                <Globe className="w-3 h-3 text-green-500" />
              </div>
            )}
          </div>
          <div className="folder-list-info">
            <div className="folder-list-header">
              <h3 className="folder-list-name">{folder.name}</h3>
              {isPublic && (
                <span className="public-badge">
                  <Globe className="w-3 h-3" />
                  Public
                </span>
              )}
            </div>
            <p className="folder-list-count">
              {fileCount} {fileCount === 1 ? 'item' : 'items'}
              {isPublic && folder.public_slug && (
                <span className="public-url"> • /api/public/assets/{folder.public_slug}</span>
              )}
            </p>
          </div>
          
          <div className="folder-list-actions">
            {isPublic && folder.public_slug && (
              <>
                <button
                  onClick={handleCopyUrl}
                  className="list-action-btn"
                  title="Copy public URL"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={handleViewAssets}
                  className="list-action-btn"
                  title="View public assets"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </>
            )}
            
            <button
              onClick={handleFavoriteToggle}
              className={`list-action-btn favorite ${isFavorite ? 'active' : ''}`}
              title="Toggle favorite"
            >
              {isFavorite ? <StarFilledIcon /> : <StarIcon />}
            </button>
            
            <button
              onClick={handlePublicToggle}
              className={`list-action-btn public-toggle ${isPublic ? 'active' : ''}`}
              title={isPublic ? 'Make private' : 'Make public'}
            >
              {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Grid view with public folder enhancements
  return (
    <div
      className={`folder-3d ${chartClass} ${isSelected ? 'selected' : ''} ${isEmpty ? 'empty' : ''} ${isPublic ? 'public' : ''} ${themeReady ? 'ready' : 'loading'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        width: '200px',
        height: '150px',
        margin: '20px auto',
        cursor: 'pointer',
        transition: 'transform 0.3s ease',
        transform: isSelected ? 'translateY(-8px) scale(1.05)' : 
                  isHovered ? 'translateY(-5px) scale(1.02)' : 'none'
      }}
    >
      {/* Public Folder Indicator Badge */}
      {isPublic && (
        <div 
          className="public-indicator-badge"
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
          }}
        >
          <Globe className="w-3 h-3 text-white" />
        </div>
      )}

      {/* 1. BACK PANEL */}
      <div 
        className="folder-back"
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: '4px',
          left: '4px',
          borderRadius: '12px',
          background: isPublic 
            ? 'linear-gradient(145deg, #10b981 0%, #059669 100%)'
            : `linear-gradient(145deg, hsl(var(--${chartClass}) / 0.8) 0%, hsl(var(--${chartClass}) / 0.5) 100%)`,
          boxShadow: `var(--shadow), inset 0 3px 6px rgba(0, 0, 0, 0.2)`,
          ...(isSelected && {
            background: 'linear-gradient(145deg, hsl(var(--primary) / 0.8) 0%, hsl(var(--primary) / 0.5) 100%)',
            boxShadow: `var(--shadow), inset 0 3px 6px rgba(0, 0, 0, 0.25)`
          }),
          ...(isEmpty && {
            background: 'linear-gradient(145deg, hsl(var(--muted) / 0.8) 0%, hsl(var(--muted) / 0.5) 100%)',
            boxShadow: `var(--shadow), inset 0 3px 6px rgba(0, 0, 0, 0.15)`
          })
        }}
      ></div>
      
      {/* 2. TAB */}
      <div 
        className="folder-tab"
        style={{
          position: 'absolute',
          width: '60px',
          height: '20px',
          top: '-10px',
          left: '20px',
          borderRadius: '8px 8px 0 0',
          background: isPublic 
            ? '#10b981'
            : `hsl(var(--${chartClass}) / 0.95)`,
          border: isPublic 
            ? '2px solid #059669'
            : `2px solid hsl(var(--${chartClass}) / 0.7)`,
          borderBottom: 'none',
          boxShadow: `var(--shadow), inset 0 1px 3px rgba(0, 0, 0, 0.1)`,
          ...(isSelected && {
            background: 'hsl(var(--primary) / 0.95)',
            borderColor: 'hsl(var(--primary) / 0.7)',
            boxShadow: `var(--shadow), inset 0 1px 3px rgba(0, 0, 0, 0.15)`
          }),
          ...(isEmpty && {
            background: 'hsl(var(--muted) / 0.8)',
            borderColor: 'hsl(var(--muted) / 0.6)',
            boxShadow: `var(--shadow), inset 0 1px 3px rgba(0, 0, 0, 0.05)`
          })
        }}
      ></div>
      
      {/* 3. PAPER SHEETS */}
      {Array.from({ length: paperLayers }, (_, i) => (
        <div 
          key={i} 
          className="paper" 
          style={{
            position: 'absolute',
            width: '75%',
            height: '60%',
            left: `${12.5 + i * 1}%`,
            top: `${30 + i * 1}%`,
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border) / 0.3)',
            borderRadius: '4px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)',
            opacity: isEmpty ? 0.3 : (0.8 - i * 0.1),
            transform: (isClicked || isHovered) ? `translateY(-${4 + i * 2}px) translateX(${i * 1}px) rotate(${i * 1}deg)` : 'none',
            transition: 'all 0.3s ease'
          }}
        ></div>
      ))}
      
      {/* 4. FRONT COVER */}
      <div 
        className="folder-front"
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: '0px',
          left: '0px',
          borderRadius: '12px 6px 12px 12px',
          background: isPublic 
            ? 'linear-gradient(145deg, #10b981 0%, #059669 100%)'
            : `linear-gradient(145deg, hsl(var(--${chartClass})) 0%, hsl(var(--${chartClass}) / 0.9) 100%)`,
          border: isPublic 
            ? '2px solid #059669'
            : `2px solid hsl(var(--${chartClass}) / 0.7)`,
          boxShadow: `var(--shadow), inset 0 2px 8px rgba(0, 0, 0, 0.15), inset 0 -2px 4px rgba(0, 0, 0, 0.1)`,
          ...(isSelected && {
            background: 'linear-gradient(145deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.9) 100%)',
            borderColor: 'hsl(var(--primary) / 0.7)',
            boxShadow: `var(--shadow), inset 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 -2px 4px rgba(0, 0, 0, 0.15)`
          }),
          ...(isEmpty && {
            background: 'linear-gradient(145deg, hsl(var(--muted)) 0%, hsl(var(--muted) / 0.7) 100%)',
            borderColor: 'hsl(var(--muted) / 0.6)',
            boxShadow: `var(--shadow), inset 0 2px 6px rgba(0, 0, 0, 0.1), inset 0 -2px 3px rgba(0, 0, 0, 0.05)`
          })
        }}
      ></div>
      
      {/* 5. TEXT CONTENT */}
      <div 
        className="folder-text"
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          right: '20px',
          pointerEvents: 'none'
        }}
      >
        <div className="folder-header" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
          <h3 
            className="folder-name"
            style={{
              margin: '0',
              fontSize: '14px',
              fontWeight: '600',
              color: 'white',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: isPublic ? '100px' : '120px',
              flex: 1
            }}
          >
            {folder.name}
          </h3>
          {isPublic && (
            <Globe 
              className="w-4 h-4 text-white" 
              style={{ 
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
              }} 
            />
          )}
        </div>
        
        <p 
          className="folder-count"
          style={{
            margin: '0',
            fontSize: '12px',
            color: 'rgba(255, 255, 255, 0.9)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            fontWeight: '500'
          }}
        >
          {isEmpty ? 'Empty' : `${fileCount} ${fileCount === 1 ? 'item' : 'items'}`}
        </p>
        
        {isPublic && folder.public_slug && (
          <p 
            style={{
              margin: '2px 0 0 0',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.8)',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            /{folder.public_slug}
          </p>
        )}
      </div>
      
      {/* 6. ACTION BUTTONS */}
      <div 
        className={`folder-actions ${(isHovered || isClicked) ? 'show' : ''}`}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          gap: '8px',
          opacity: (isHovered || isClicked) ? 1 : 0,
          transform: (isHovered || isClicked) ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.9)',
          transition: 'all 0.3s ease',
          pointerEvents: 'auto'
        }}
      >
        {/* Public folder quick actions */}
        {isPublic && folder.public_slug && (
          <>
            <button
              onClick={handleCopyUrl}
              className="action-btn copy"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(16, 185, 129, 0.2)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(8px)'
              }}
              title="Copy public URL"
            >
              <Copy className="w-4 h-4" />
            </button>
            
            <button
              onClick={handleViewAssets}
              className="action-btn view"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(16, 185, 129, 0.2)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                backdropFilter: 'blur(8px)'
              }}
              title="View public assets"
            >
              <Eye className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Public/Private toggle */}
        <button
          onClick={handlePublicToggle}
          className={`action-btn public-toggle ${isPublic ? 'active' : ''}`}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            background: isPublic ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(8px)'
          }}
          title={isPublic ? 'Make private' : 'Make public'}
        >
          {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        </button>

        {/* Favorite button */}
        <button
          onClick={handleFavoriteToggle}
          className={`action-btn favorite ${isFavorite ? 'active' : ''}`}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            background: isFavorite ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 255, 255, 0.2)',
            color: isFavorite ? '#ffc107' : 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(8px)'
          }}
        >
          {isFavorite ? <StarFilledIcon /> : <StarIcon />}
        </button>

        {/* More options */}
        <button 
          onClick={handleMoreClick} 
          className="action-btn more"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            backdropFilter: 'blur(8px)'
          }}
        >
          <MoreVerticalIcon />
        </button>
      </div>
    </div>
  );
}