import React, { useState, useCallback } from 'react';
import { 
  FileIcon, 
  ImageIcon, 
  PdfIcon, 
  WordIcon, 
  ExcelIcon, 
  PowerPointIcon,
  VideoIcon,
  AudioIcon,
  ArchiveIcon,
  CodeIcon,
  StarIcon, 
  MoreVerticalIcon, 
  DownloadIcon,
  EyeIcon,
  ShareIcon
} from './icons';

interface DocumentItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  mime_type?: string;
  uploader_name?: string;
  tags?: string[];
}

interface FileProps {
  file: DocumentItem;
  viewMode?: 'grid' | 'list';
  isSelected?: boolean;
  isFavorite?: boolean;
  onPreview?: (fileId: string) => void;
  onDownload?: (fileId: string) => void;
  onToggleFavorite?: (fileId: string) => void;
  onContextMenu?: (e: React.MouseEvent, fileId: string) => void;
  onSelect?: (fileId: string, isMultiSelect?: boolean) => void;
  className?: string;
}

export default function File({
  file,
  viewMode = 'grid',
  isSelected = false,
  isFavorite = false,
  onPreview,
  onDownload,
  onToggleFavorite,
  onContextMenu,
  onSelect,
  className = ''
}: FileProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get appropriate icon based on MIME type
  const getFileIcon = useCallback(() => {
    if (!file.mime_type) return <FileIcon className="h-full w-full text-hsl(var(--muted-foreground))" />;

    const mimeType = file.mime_type.toLowerCase();
    const iconProps = { className: "h-full w-full" };

    if (mimeType.startsWith('image/')) return <ImageIcon {...iconProps} className="h-full w-full text-green-500" />;
    if (mimeType.includes('pdf')) return <PdfIcon {...iconProps} className="h-full w-full text-red-500" />;
    if (mimeType.includes('word') || mimeType.includes('document')) return <WordIcon {...iconProps} className="h-full w-full text-blue-600" />;
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return <ExcelIcon {...iconProps} className="h-full w-full text-green-600" />;
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return <PowerPointIcon {...iconProps} className="h-full w-full text-orange-500" />;
    if (mimeType.startsWith('video/')) return <VideoIcon {...iconProps} className="h-full w-full text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <AudioIcon {...iconProps} className="h-full w-full text-pink-500" />;
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return <ArchiveIcon {...iconProps} className="h-full w-full text-yellow-600" />;
    if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css')) return <CodeIcon {...iconProps} className="h-full w-full text-blue-500" />;

    return <FileIcon {...iconProps} className="h-full w-full text-hsl(var(--muted-foreground))" />;
  }, [file.mime_type]);

  // Check if file can be previewed
  const canPreview = useCallback(() => {
    if (!file.mime_type) return false;
    const mimeType = file.mime_type.toLowerCase();
    return mimeType.startsWith('image/') || 
           mimeType.includes('pdf') || 
           mimeType.startsWith('text/') ||
           mimeType.includes('json');
  }, [file.mime_type]);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  // Format MIME type for display
  const formatMimeType = (mimeType: string): string => {
    const mimeMap: Record<string, string> = {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
      'application/vnd.ms-excel': 'Excel',
      'application/msword': 'Word',
      'application/vnd.ms-powerpoint': 'PowerPoint',
      'application/pdf': 'PDF',
      'text/plain': 'Text',
      'image/jpeg': 'JPEG',
      'image/png': 'PNG',
      'image/gif': 'GIF',
      'image/webp': 'WebP',
      'video/mp4': 'MP4',
      'audio/mpeg': 'MP3'
    };

    const friendlyName = mimeMap[mimeType.toLowerCase()];
    if (friendlyName) return friendlyName;

    const parts = mimeType.split('/');
    if (parts.length === 2) {
      return parts[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    return 'FILE';
  };

  // Handle file click for preview
  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.file-actions')) {
      return;
    }

    if (canPreview()) {
      onPreview?.(file.id);
    } else if (e.ctrlKey || e.metaKey) {
      onSelect?.(file.id, true);
    } else {
      onSelect?.(file.id, false);
    }
  }, [canPreview, onPreview, onSelect, file.id]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e, file.id);
  }, [onContextMenu, file.id]);

  // Handle favorite toggle
  const handleFavoriteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(file.id);
  }, [onToggleFavorite, file.id]);

  // Handle download
  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDownload?.(file.id);
  }, [onDownload, file.id]);

  // Handle preview
  const handlePreview = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onPreview?.(file.id);
  }, [onPreview, file.id]);

  if (viewMode === 'list') {
    return (
      <div
        className={`group flex items-center gap-4 p-3 transition-all duration-200 ${
          isSelected 
            ? 'bg-hsl(var(--accent)) border border-hsl(var(--primary))' 
            : isHovered 
              ? 'bg-hsl(var(--accent))/50' 
              : 'hover:bg-hsl(var(--accent))/30'
        } ${className}`}
        style={{
          borderRadius: '8px',
          cursor: 'pointer'
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Large File Icon - No background container */}
        <div className="h-12 w-12 flex-shrink-0 flex items-center justify-center">
          {file.mime_type?.startsWith('image/') && !imageError ? (
            <img
              src={`/api/documents/${file.id}/thumbnail`}
              alt={file.name}
              className="h-full w-full rounded object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            getFileIcon()
          )}
        </div>

        {/* File Name */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-hsl(var(--foreground)) truncate text-base">
            {file.name}
          </h3>
          
          {/* Metadata Container */}
          <div 
            className="mt-2 px-3 py-1 rounded-md text-xs text-hsl(var(--muted-foreground))"
            style={{
              backgroundColor: 'hsl(var(--muted))',
              border: '1px solid hsl(var(--border))'
            }}
          >
            <div className="flex items-center gap-3">
              <span>{formatFileSize(file.size_bytes)}</span>
              <span>•</span>
              <span>{formatDate(file.created_at)}</span>
              <span>•</span>
              {file.mime_type && <span>{formatMimeType(file.mime_type)}</span>}
              {file.uploader_name && (
                <>
                  <span>•</span>
                  <span>by {file.uploader_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className={`file-actions flex items-center gap-1 transition-opacity duration-200 ${
          isHovered || isSelected ? 'opacity-100' : 'opacity-0'
        }`}>
          {canPreview() && (
            <button
              onClick={handlePreview}
              className="p-2 rounded-md transition-colors hover:bg-hsl(var(--accent)) text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground))"
              title="Preview"
            >
              <EyeIcon className="h-4 w-4" />
            </button>
          )}
          
          <button
            onClick={handleDownload}
            className="p-2 rounded-md transition-colors hover:bg-hsl(var(--accent)) text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground))"
            title="Download"
          >
            <DownloadIcon className="h-4 w-4" />
          </button>

          <button
            onClick={handleFavoriteToggle}
            className={`p-2 rounded-md transition-colors hover:bg-hsl(var(--accent)) ${
              isFavorite ? 'text-yellow-500' : 'text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground))'
            }`}
            title="Toggle favorite"
          >
            <StarIcon className="h-4 w-4" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu?.(e, file.id);
            }}
            className="p-2 rounded-md transition-colors hover:bg-hsl(var(--accent)) text-hsl(var(--muted-foreground)) hover:text-hsl(var(--foreground))"
            title="More options"
          >
            <MoreVerticalIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Favorite indicator */}
        {isFavorite && (
          <div className="absolute top-2 right-2">
            <StarIcon className="h-4 w-4 text-yellow-500" fill="currentColor" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group relative flex flex-col items-center p-4 transition-all duration-200 ${
        isSelected 
          ? 'bg-hsl(var(--accent)) border-2 border-hsl(var(--primary))' 
          : isHovered 
            ? 'bg-hsl(var(--accent))/50' 
            : 'hover:bg-hsl(var(--accent))/30'
      } ${className}`}
      style={{
        borderRadius: '12px',
        width: '160px',
        height: '180px',
        cursor: 'pointer'
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Large File Icon - No background container */}
      <div className="relative mb-3 h-16 w-16 flex-shrink-0 flex items-center justify-center">
        {file.mime_type?.startsWith('image/') && !imageError ? (
          <img
            src={`/api/documents/${file.id}/thumbnail`}
            alt={file.name}
            className="h-full w-full rounded-md object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          getFileIcon()
        )}
        
        {/* Favorite indicator on icon */}
        {isFavorite && (
          <div className="absolute -top-1 -right-1">
            <StarIcon className="h-4 w-4 text-yellow-500" fill="currentColor" />
          </div>
        )}
      </div>

      {/* File Name */}
      <h3 
        className="mb-3 w-full truncate text-sm font-medium text-hsl(var(--foreground)) text-center leading-tight" 
        title={file.name}
      >
        {file.name}
      </h3>

      {/* Metadata Container */}
      <div 
        className="w-full px-2 py-2 rounded-md text-xs text-hsl(var(--muted-foreground)) text-center space-y-1"
        style={{
          backgroundColor: 'hsl(var(--muted))',
          border: '1px solid hsl(var(--border))'
        }}
      >
        <div>{formatFileSize(file.size_bytes)}</div>
        <div>{formatDate(file.created_at)}</div>
        {file.mime_type && (
          <div className="font-medium">{formatMimeType(file.mime_type)}</div>
        )}
        {file.uploader_name && (
          <div>by {file.uploader_name}</div>
        )}
      </div>

      {/* Tags */}
      {file.tags && file.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {file.tags.slice(0, 2).map((tag, index) => (
            <span
              key={index}
              className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: 'hsl(var(--muted))',
                color: 'hsl(var(--muted-foreground))'
              }}
            >
              {tag}
            </span>
          ))}
          {file.tags.length > 2 && (
            <span className="text-xs text-hsl(var(--muted-foreground))">+{file.tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Action Buttons (Show on Hover) */}
      <div className={`file-actions absolute right-2 top-2 flex gap-1 transition-opacity duration-200 ${
        isHovered || isSelected ? 'opacity-100' : 'opacity-0'
      }`}>
        {canPreview() && (
          <button
            onClick={handlePreview}
            className="p-1.5 rounded-full shadow-sm transition-all duration-200 hover:scale-105"
            style={{
              backgroundColor: 'hsl(var(--background))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--muted-foreground))'
            }}
            title="Preview"
          >
            <EyeIcon className="h-3.5 w-3.5" />
          </button>
        )}
        
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-full shadow-sm transition-all duration-200 hover:scale-105"
          style={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--muted-foreground))'
          }}
          title="Download"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={handleFavoriteToggle}
          className={`p-1.5 rounded-full shadow-sm transition-all duration-200 hover:scale-105 ${
            isFavorite ? 'text-yellow-500' : ''
          }`}
          style={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            color: isFavorite ? '' : 'hsl(var(--muted-foreground))'
          }}
          title="Toggle favorite"
        >
          <StarIcon className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu?.(e, file.id);
          }}
          className="p-1.5 rounded-full shadow-sm transition-all duration-200 hover:scale-105"
          style={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--muted-foreground))'
          }}
          title="More options"
        >
          <MoreVerticalIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
