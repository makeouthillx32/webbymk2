'use client';

import React from 'react';
import { Folder as FolderLucide } from 'lucide-react';

import Folder from '../Folder';
import File from '../File';
import Breadcrumb from '../Breadcrumb';

interface DocumentItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  size_bytes?: number;  // Fixed: was 'size', should be 'size_bytes' to match interface
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  mime_type?: string;
  fileCount?: number;
  // Added missing properties that components might expect
  is_public_folder?: boolean;
  public_slug?: string;
  uploader_name?: string;
  tags?: string[];
}

interface FileGridProps {
  documents: DocumentItem[];
  viewMode: 'grid' | 'list';
  selectedItems: string[];
  searchQuery?: string;
  currentPath?: string;
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigate: (path: string) => void;
  onAddFavorite: (path: string, name: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onSelect: (id: string, isMulti: boolean) => void;
  className?: string;
}

function FileGrid({
  documents,
  viewMode,
  selectedItems,
  searchQuery,
  currentPath,
  onPreview,
  onDownload,
  onToggleFavorite,
  onNavigate,
  onAddFavorite,
  onContextMenu,
  onSelect,
  className = '',
}: FileGridProps) {
  console.log('🎯 FileGrid rendering with:', {
    documentsCount: documents.length,
    viewMode,
    currentPath,
    hasContextMenuHandler: !!onContextMenu
  });

  const getChartColorClass = (index: number): string => {
    const chartColors = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];
    return chartColors[index % chartColors.length];
  };

  const EmptyState = React.memo(() => (
    <div className="col-span-full text-center py-12">
      <FolderLucide className="mx-auto w-12 h-12 text-muted-foreground mb-4" />
      <p className="text-muted-foreground">
        {searchQuery ? 'No documents found' : 'This folder is empty'}
      </p>
      {!currentPath && (
        <p className="text-muted-foreground/70 mt-2">
          Click "Upload" to add files or "New Folder" to create folders
        </p>
      )}
    </div>
  ));

  const gridClasses = React.useMemo(() => {
    return `documents-content ${
      viewMode === 'grid'
        ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4'
        : 'space-y-2'
    }`;
  }, [viewMode]);

  // Enhanced context menu handler with debugging
  const handleContextMenu = React.useCallback((e: React.MouseEvent, id: string) => {
    console.log('🎯 FileGrid handleContextMenu called:', { id, hasHandler: !!onContextMenu });
    if (onContextMenu) {
      onContextMenu(e, id);
    } else {
      console.warn('❌ FileGrid: onContextMenu handler is missing');
    }
  }, [onContextMenu]);

  // Enhanced select handler with debugging
  const handleSelect = React.useCallback((id: string, isMulti: boolean) => {
    console.log('🎯 FileGrid handleSelect called:', { id, isMulti });
    onSelect(id, isMulti);
  }, [onSelect]);

  return (
    <div className={`file-grid-container flex flex-col w-full space-y-6 ${className}`}>
      <Breadcrumb currentPath={currentPath || ''} onNavigate={onNavigate} />

      {currentPath && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              const pathParts = currentPath.split('/').filter(Boolean);
              const parentPath =
                pathParts.length > 1
                  ? pathParts.slice(0, -1).join('/') + '/'
                  : '';
              console.log('🎯 FileGrid navigating back to:', parentPath);
              onNavigate(parentPath);
            }}
            className="flex items-center gap-2 px-4 py-2 text-primary hover:text-primary/80 hover:bg-accent rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to{' '}
            {currentPath.split('/').filter(Boolean).length > 1
              ? currentPath.split('/').filter(Boolean).slice(-2, -1)[0]
              : 'Home'}
          </button>

          <div className="text-sm text-muted-foreground">
            {documents.length} item{documents.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      <div className={gridClasses}>
        {documents.length === 0 ? (
          <EmptyState />
        ) : (
          documents.map((doc, index) => {
            console.log('🎯 Rendering document:', { 
              id: doc.id, 
              name: doc.name, 
              type: doc.type,
              index 
            });

            if (doc.type === 'folder') {
              return (
                <Folder
                  key={doc.id}
                  folder={{
                    id: doc.id,
                    name: doc.name,
                    path: doc.path,
                    type: 'folder',
                    is_favorite: doc.is_favorite,
                    is_public_folder: doc.is_public_folder,
                    public_slug: doc.public_slug,
                    fileCount: doc.fileCount
                  }}
                  viewMode={viewMode}
                  isSelected={selectedItems.includes(doc.id)}
                  isFavorite={doc.is_favorite}
                  index={index}
                  chartColorClass={getChartColorClass(index)}
                  onNavigate={onNavigate}
                  onToggleFavorite={(path, name) => {
                    console.log('🎯 FileGrid folder favorite toggle:', { path, name });
                    onAddFavorite(path, name);
                  }}
                  onContextMenu={handleContextMenu}
                  onSelect={handleSelect}
                  // Pass through additional public folder handlers if available
                  onMakePublic={undefined} // These would come from parent if needed
                  onMakePrivate={undefined}
                  onCopyPublicUrl={undefined}
                  onViewPublicAssets={undefined}
                  onGenerateCode={undefined}
                />
              );
            } else {
              return (
                <File
                  key={doc.id}
                  file={{
                    id: doc.id,
                    name: doc.name,
                    type: 'file',
                    path: doc.path,
                    size_bytes: doc.size_bytes || 0,
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                    is_favorite: doc.is_favorite,
                    mime_type: doc.mime_type,
                    uploader_name: doc.uploader_name,
                    tags: doc.tags
                  }}
                  viewMode={viewMode}
                  isSelected={selectedItems.includes(doc.id)}
                  isFavorite={doc.is_favorite}
                  onPreview={() => {
                    console.log('🎯 FileGrid file preview:', doc.id);
                    onPreview(doc.id);
                  }}
                  onDownload={() => {
                    console.log('🎯 FileGrid file download:', doc.id);
                    onDownload(doc.id);
                  }}
                  onToggleFavorite={() => {
                    console.log('🎯 FileGrid file favorite toggle:', doc.id);
                    onToggleFavorite(doc.id);
                  }}
                  onContextMenu={handleContextMenu}
                  onSelect={handleSelect}
                />
              );
            }
          })
        )}
      </div>
    </div>
  );
}

export default React.memo(FileGrid, (prevProps, nextProps) => {
  const isEqual = (
    prevProps.documents === nextProps.documents &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.selectedItems === nextProps.selectedItems &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.currentPath === nextProps.currentPath &&
    prevProps.className === nextProps.className
  );
  
  console.log('🎯 FileGrid memo check:', { 
    isEqual, 
    documentsChanged: prevProps.documents !== nextProps.documents,
    viewModeChanged: prevProps.viewMode !== nextProps.viewMode 
  });
  
  return isEqual;
});