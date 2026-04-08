// components/documents/ContextMenu/index.tsx - Enhanced with Public Folder & File Sharing + Copy URL
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { 
  Globe, 
  Lock, 
  Copy, 
  Code, 
  Eye, 
  Link, 
  Link2,
  Star,
  Download,
  Edit,
  Move,
  Trash2,
  Share,
  Info,
  FolderOpen
} from 'lucide-react';
import { DocumentItem } from '@/hooks/useDocuments';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  documentItem?: DocumentItem;
  onClose: () => void;
  onAction: (action: string, documentId: string) => void;
  
  // Public folder specific props
  isPublicFolder?: boolean;
  publicSlug?: string;
  onMakePublic?: (documentId: string) => void;
  onMakePrivate?: (documentId: string) => void;
  onCopyPublicUrl?: (publicSlug: string) => void;
  onCopyFileUrl?: (documentId: string, fileName: string) => void;
  onGenerateCode?: (publicSlug: string) => void;
  
  className?: string;
}

interface MenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  dangerous?: boolean;
  separator?: boolean;
  highlighted?: boolean;
  submenu?: MenuAction[];
}

export default function ContextMenu({
  isOpen,
  position,
  documentItem,
  onClose,
  onAction,
  isPublicFolder = false,
  publicSlug,
  onMakePublic,
  onMakePrivate,
  onCopyPublicUrl,
  onCopyFileUrl,
  onGenerateCode,
  className = ''
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Handle action click
  const handleAction = useCallback((actionId: string) => {
    if (!documentItem) return;

    switch (actionId) {
      case 'makePublic':
        onMakePublic?.(documentItem.id);
        break;
      case 'makePrivate':
        onMakePrivate?.(documentItem.id);
        break;
      case 'copyPublicUrl':
        if (publicSlug) onCopyPublicUrl?.(publicSlug);
        break;
      case 'copyFileUrl':
        onCopyFileUrl?.(documentItem.id, documentItem.name);
        break;
      case 'generateCode':
        if (publicSlug) onGenerateCode?.(publicSlug);
        break;
      case 'copy-url':
        // This will be handled by the parent component to open the modal
        onAction('copy-url', documentItem.id);
        break;
      default:
        onAction(actionId, documentItem.id);
    }
    onClose();
  }, [documentItem, onAction, onClose, onMakePublic, onMakePrivate, onCopyPublicUrl, onCopyFileUrl, onGenerateCode, publicSlug]);

  // Check if file can be previewed
  const canPreview = useCallback(() => {
    if (!documentItem?.mime_type) return false;
    const mimeType = documentItem.mime_type.toLowerCase();
    return mimeType.startsWith('image/') || 
           mimeType.includes('pdf') || 
           mimeType.startsWith('text/') ||
           mimeType.includes('json');
  }, [documentItem?.mime_type]);

  // Get public asset URL
  const getPublicAssetUrl = useCallback(() => {
    if (!publicSlug || !documentItem) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/api/public/assets/${publicSlug}/${documentItem.name}`;
  }, [publicSlug, documentItem]);

  // Get menu actions based on document type
  const getMenuActions = useCallback((): MenuAction[] => {
    if (!documentItem) return [];

    const isFolder = documentItem.type === 'folder';
    const isFile = documentItem.type === 'file';
    const isImage = documentItem.mime_type?.startsWith('image/');

    const actions: MenuAction[] = [];

    // === PRIMARY ACTIONS ===

    // Preview (files only)
    if (isFile && canPreview()) {
      actions.push({
        id: 'preview',
        label: 'Preview',
        icon: <Eye className="h-4 w-4" />,
        shortcut: 'Space'
      });
    }

    // Open (folders only)
    if (isFolder) {
      actions.push({
        id: 'open',
        label: 'Open Folder',
        icon: <FolderOpen className="h-4 w-4" />,
        shortcut: '⏎'
      });
    }

    // Download (files only)
    if (isFile) {
      actions.push({
        id: 'download',
        label: 'Download',
        icon: <Download className="h-4 w-4" />,
        shortcut: '⌘D'
      });
    }

    // Separator after primary actions
    if (actions.length > 0) {
      actions.push({ id: 'sep1', label: '', icon: null, separator: true });
    }

    // === COPY URL ACTION (Files Only) ===
    
    if (isFile) {
      actions.push({
        id: 'copy-url',
        label: 'Copy URL',
        icon: <Link2 className="h-4 w-4" />,
        shortcut: '⌘C',
        highlighted: true
      });

      // Separator after Copy URL
      actions.push({ id: 'sep-url', label: '', icon: null, separator: true });
    }

    // === PUBLIC FOLDER ACTIONS ===

    if (isFolder) {
      if (isPublicFolder) {
        // Public folder actions
        actions.push({
          id: 'publicFolderActions',
          label: 'Public Folder',
          icon: <Globe className="h-4 w-4 text-green-500" />,
          highlighted: true,
          submenu: [
            {
              id: 'copyPublicUrl',
              label: 'Copy Public URL',
              icon: <Copy className="h-4 w-4" />,
              shortcut: '⌘L'
            },
            {
              id: 'generateCode',
              label: 'Generate Code Snippet',
              icon: <Code className="h-4 w-4" />
            },
            {
              id: 'viewPublicAssets',
              label: 'View Public Assets',
              icon: <Eye className="h-4 w-4" />
            },
            { id: 'sep-public', label: '', icon: null, separator: true },
            {
              id: 'makePrivate',
              label: 'Make Private',
              icon: <Lock className="h-4 w-4" />,
              dangerous: true
            }
          ]
        });
      } else {
        // Make folder public option
        actions.push({
          id: 'makePublic',
          label: 'Make Folder Public',
          icon: <Globe className="h-4 w-4" />,
          highlighted: true
        });
      }

      // Separator after public folder actions
      actions.push({ id: 'sep2', label: '', icon: null, separator: true });
    }

    // === FILE SHARING ACTIONS ===

    if (isFile) {
      const shareActions: MenuAction[] = [
        {
          id: 'copyFileUrl',
          label: 'Copy Storage URL',
          icon: <Link className="h-4 w-4" />,
          shortcut: '⌘L'
        }
      ];

      // If file is in a public folder, add public URL option
      if (isPublicFolder && publicSlug) {
        shareActions.unshift({
          id: 'copyPublicFileUrl',
          label: 'Copy Public URL',
          icon: <Globe className="h-4 w-4 text-green-500" />,
          highlighted: true
        });
      }

      // If it's an image in a public folder, add code generation
      if (isImage && isPublicFolder && publicSlug) {
        shareActions.push({
          id: 'generateImageCode',
          label: 'Generate Image Code',
          icon: <Code className="h-4 w-4" />
        });
      }

      actions.push({
        id: 'shareOptions',
        label: 'Share',
        icon: <Share className="h-4 w-4" />,
        submenu: shareActions
      });

      // Separator after sharing actions
      actions.push({ id: 'sep3', label: '', icon: null, separator: true });
    }

    // === STANDARD ACTIONS ===

    // Rename
    actions.push({
      id: 'rename',
      label: 'Rename',
      icon: <Edit className="h-4 w-4" />,
      shortcut: 'F2'
    });

    // Move
    actions.push({
      id: 'move',
      label: 'Move to...',
      icon: <Move className="h-4 w-4" />,
      shortcut: '⌘X'
    });

    // Separator
    actions.push({ id: 'sep4', label: '', icon: null, separator: true });

    // Add to favorites / Remove from favorites
    actions.push({
      id: 'favorite',
      label: documentItem.is_favorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: <Star className={`h-4 w-4 ${documentItem.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />,
      shortcut: '⌘F'
    });

    // Separator
    actions.push({ id: 'sep5', label: '', icon: null, separator: true });

    // Properties/Info
    actions.push({
      id: 'info',
      label: 'Properties',
      icon: <Info className="h-4 w-4" />,
      shortcut: '⌘I'
    });

    // Separator
    actions.push({ id: 'sep6', label: '', icon: null, separator: true });

    // Delete
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      shortcut: 'Del',
      dangerous: true
    });

    return actions;
  }, [documentItem, canPreview, isPublicFolder, publicSlug]);

  // Handle special actions
  const handleSpecialAction = useCallback((actionId: string) => {
    if (!documentItem) return;

    switch (actionId) {
      case 'copyPublicFileUrl':
        if (publicSlug) {
          const url = getPublicAssetUrl();
          navigator.clipboard.writeText(url);
        }
        break;
      case 'generateImageCode':
        if (publicSlug) {
          const url = getPublicAssetUrl();
          const code = `<Image
  src="${url}"
  alt="${documentItem.name}"
  width={400}
  height={300}
  className="rounded-lg"
/>`;
          navigator.clipboard.writeText(code);
        }
        break;
      case 'viewPublicAssets':
        if (publicSlug) {
          const baseUrl = window.location.origin;
          window.open(`${baseUrl}/api/public/assets/${publicSlug}/`, '_blank');
        }
        break;
      default:
        handleAction(actionId);
        return;
    }
    onClose();
  }, [documentItem, publicSlug, getPublicAssetUrl, handleAction, onClose]);

  // Position menu within viewport
  const getMenuPosition = useCallback(() => {
    if (!menuRef.current) return position;

    const menu = menuRef.current;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let { x, y } = position;

    // Adjust horizontal position
    if (x + menu.offsetWidth > viewport.width) {
      x = viewport.width - menu.offsetWidth - 10;
    }

    // Adjust vertical position
    if (y + menu.offsetHeight > viewport.height) {
      y = viewport.height - menu.offsetHeight - 10;
    }

    return { x: Math.max(10, x), y: Math.max(10, y) };
  }, [position]);

  // Handle clicks outside menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !documentItem) return null;

  const menuPosition = getMenuPosition();
  const menuActions = getMenuActions();

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 min-w-[200px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 ${className}`}
      style={{
        left: menuPosition.x,
        top: menuPosition.y
      }}
    >
      {menuActions.map((action) => {
        if (action.separator) {
          return (
            <div
              key={action.id}
              className="my-1 h-px bg-gray-200 dark:bg-gray-600"
            />
          );
        }

        return (
          <button
            key={action.id}
            onClick={() => handleSpecialAction(action.id)}
            disabled={action.disabled}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${
              action.dangerous
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                : action.highlighted
                ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            } ${
              action.disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'cursor-pointer'
            }`}
          >
            <div className="flex items-center gap-3">
              {action.icon}
              <span>{action.label}</span>
            </div>
            {action.shortcut && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {action.shortcut}
              </span>
            )}
          </button>
        );
      })}

      {/* Document Info Footer */}
      <div className="border-t border-gray-200 dark:border-gray-600 mt-1 pt-2 px-3 pb-2">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <div className="font-medium truncate" title={documentItem.name}>
            {documentItem.name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span>{documentItem.type === 'folder' ? 'Folder' : documentItem.mime_type?.split('/')[1]?.toUpperCase() || 'File'}</span>
            {documentItem.type === 'file' && documentItem.size_bytes && (
              <>
                <span>•</span>
                <span>{formatFileSize(documentItem.size_bytes)}</span>
              </>
            )}
            {isPublicFolder && (
              <>
                <span>•</span>
                <span className="text-green-600 dark:text-green-400 font-medium">Public</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}