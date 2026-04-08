'use client';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  useDocuments,
  useFileUpload,
  useFolderFavorites,
} from '@/hooks/useDocuments';
import { usePublicFolders } from '@/hooks/usePublicFolders';
import DragDropUpload from './DragDropUpload';
import Toolbar from './Toolbar';
import ContextMenu from './ContextMenu';
import Preview from './Preview';
import FavoritesBar from './FavoritesBar';
import FileGrid from './FileGrid';
import CopyUrlModal from './CopyUrlModal';
import { Upload, X } from 'lucide-react';

interface DocumentsProps {
  className?: string;
}

const debounce = (fn: Function, delay = 300) => {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export default function Documents({ className = '' }: DocumentsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    documentId: string;
  } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [dragOverUploadZone, setDragOverUploadZone] = useState(false);
  
  // Copy URL Modal state
  const [showCopyUrlModal, setShowCopyUrlModal] = useState(false);
  const [copyUrlDocument, setCopyUrlDocument] = useState<any>(null);
  
  // Additional state for toolbar functionality
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // ALWAYS call hooks first, no matter what
  const {
    documents,
    loading,
    error,
    currentPath,
    navigateToFolder,
    createFolder,
    updateDocument,
    deleteDocument,
    searchDocuments,
    fetchDocuments,
  } = useDocuments();

  const { uploadFiles, isUploading } = useFileUpload();
  const { favorites, addFavorite, removeFavorite } = useFolderFavorites();
  const { 
    makefolderPublic, 
    makeFolderPrivate, 
    copyFolderUrl, 
    generateUsageExample,
    getPublicAssetUrl 
  } = usePublicFolders();

  useEffect(() => {
    if (!loading && isInitialLoading) {
      setIsInitialLoading(false);
    }
  }, [loading, isInitialLoading]);

  const debouncedSearch = useCallback(
    debounce(async (query: string, path: string) => {
      setIsSearching(true);
      try {
        if (query.trim()) {
          await searchDocuments(query, path);
        } else {
          await fetchDocuments();
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [searchDocuments, fetchDocuments]
  );

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      debouncedSearch(query, currentPath);
    },
    [debouncedSearch, currentPath]
  );

  const handleNavigate = useCallback(
    async (path: string) => {
      setIsNavigating(true);
      try {
        await navigateToFolder(path);
      } catch (error) {
        console.error('Navigation error:', error);
      } finally {
        setIsNavigating(false);
      }
    },
    [navigateToFolder]
  );

  const handleFileUpload = useCallback(
    async (files: File[]) => {
      try {
        await uploadFiles(files, currentPath);
        toast.success(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
        await fetchDocuments();
      } catch (error) {
        console.error('Upload failed:', error);
        toast.error('Upload failed');
      }
    },
    [uploadFiles, currentPath, fetchDocuments]
  );

  // Handler for drag & drop
  const handleFilesDropped = useCallback(
    async (files: File[]) => {
      await handleFileUpload(files);
    },
    [handleFileUpload]
  );

  const handleCreateFolder = useCallback(
    async () => {
      console.log('🎯 Documents handleCreateFolder called');
      
      const folderName = prompt('Enter folder name:');
      
      if (!folderName || folderName.trim().length === 0) {
        console.log('❌ User cancelled or provided empty folder name');
        return;
      }
      
      const safeFolderName = folderName.trim();
      const safeCurrentPath = typeof currentPath === 'string' ? currentPath : '';
      
      try {
        await createFolder(safeFolderName, safeCurrentPath || undefined);
        console.log('✅ Folder created successfully');
        toast.success(`Folder "${safeFolderName}" created successfully`);
        await fetchDocuments();
      } catch (error) {
        console.error('❌ Failed to create folder:', error);
        toast.error('Failed to create folder');
      }
    },
    [createFolder, currentPath, fetchDocuments]
  );

  // Public folder handlers
  const handleMakePublic = useCallback(async (documentId: string) => {
    try {
      await makefolderPublic(documentId);
      toast.success('Folder made public successfully');
      await fetchDocuments();
    } catch (error) {
      console.error('❌ Failed to make folder public:', error);
      toast.error('Failed to make folder public');
    }
  }, [makefolderPublic, fetchDocuments]);

  const handleMakePrivate = useCallback(async (documentId: string) => {
    try {
      await makeFolderPrivate(documentId);
      toast.success('Folder made private successfully');
      await fetchDocuments();
    } catch (error) {
      console.error('❌ Failed to make folder private:', error);
      toast.error('Failed to make folder private');
    }
  }, [makeFolderPrivate, fetchDocuments]);

  const handleCopyPublicUrl = useCallback((publicSlug: string) => {
    try {
      copyFolderUrl(publicSlug);
      toast.success('Public URL copied to clipboard');
    } catch (error) {
      console.error('❌ Failed to copy URL:', error);
      toast.error('Failed to copy URL');
    }
  }, [copyFolderUrl]);

  const handleGenerateCode = useCallback((publicSlug: string) => {
    try {
      const code = generateUsageExample(publicSlug);
      navigator.clipboard.writeText(code);
      toast.success('Code snippet copied to clipboard');
    } catch (error) {
      console.error('❌ Failed to generate code:', error);
      toast.error('Failed to generate code');
    }
  }, [generateUsageExample]);

  const handleDocumentAction = useCallback(
    async (action: string, documentId: string) => {
      console.log('🎯 Document action triggered:', { action, documentId });
      const document = documents.find((d) => d.id === documentId);
      if (!document) {
        console.error('❌ Document not found for action:', documentId);
        return;
      }
      
      try {
        switch (action) {
          case 'copy-url':
            // Open Copy URL Modal
            setCopyUrlDocument(document);
            setShowCopyUrlModal(true);
            break;
          case 'preview':
            setPreviewDocument(documentId);
            break;
          case 'download':
            window.open(`/api/documents/${documentId}/download`, '_blank');
            break;
          case 'favorite':
            await updateDocument(documentId, {
              is_favorite: !document.is_favorite,
            });
            break;
          case 'delete':
            if (confirm(`Are you sure you want to delete "${document.name}"?`)) {
              await deleteDocument(documentId);
            }
            break;
          case 'edit':
            const newName = prompt('Enter new name:', document.name);
            if (newName && newName !== document.name) {
              await updateDocument(documentId, { name: newName });
            }
            break;
        }
      } catch (error) {
        console.error(`❌ Failed to ${action} document:`, error);
      }
      
      setContextMenu(null);
    },
    [documents, updateDocument, deleteDocument]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, documentId: string) => {
      e.preventDefault();
      e.stopPropagation();
      
      const document = documents.find(d => d.id === documentId);
      if (!document) {
        console.error('❌ Document not found for context menu:', documentId);
        return;
      }
      
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        documentId,
      });
    },
    [documents]
  );

  const handleSelect = useCallback((id: string, isMulti: boolean) => {
    setSelectedItems((prev) =>
      isMulti
        ? prev.includes(id)
          ? prev.filter((item) => item !== id)
          : [...prev, id]
        : [id]
    );
  }, []);

  // Toolbar handlers
  const handleSortChange = useCallback((newSortBy: 'name' | 'date' | 'size' | 'type', newSortOrder: 'asc' | 'desc') => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
  }, []);

  const handleToggleFavorites = useCallback(() => {
    setShowFavoritesOnly(prev => !prev);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedItems(documents.map(doc => doc.id));
  }, [documents]);

  const handleRefresh = useCallback(async () => {
    try {
      await fetchDocuments();
    } catch (error) {
      console.error('❌ Failed to refresh:', error);
    }
  }, [fetchDocuments]);

  const fileGridHandlers = useMemo(
    () => ({
      onPreview: (id: string) => setPreviewDocument(id),
      onDownload: (id: string) => handleDocumentAction('download', id),
      onToggleFavorite: (id: string) => handleDocumentAction('favorite', id),
      onNavigate: handleNavigate,
      onAddFavorite: addFavorite,
      onContextMenu: handleContextMenu,
      onSelect: handleSelect,
    }),
    [handleDocumentAction, handleNavigate, addFavorite, handleContextMenu, handleSelect]
  );

  const favoriteItems = useMemo(
    () =>
      favorites.map((fav) => ({
        id: fav.id,
        name: fav.folder_name,
        path: fav.folder_path,
        type: 'folder' as const,
        isPinned: false,
        created_at: fav.created_at,
      })),
    [favorites]
  );

  const previewDoc = useMemo(
    () => previewDocument && documents.find((d) => d.id === previewDocument),
    [previewDocument, documents]
  );

  // Filter documents based on favorites filter
  const filteredDocuments = useMemo(() => {
    if (showFavoritesOnly) {
      return documents.filter(doc => doc.is_favorite);
    }
    return documents;
  }, [documents, showFavoritesOnly]);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    const sorted = [...filteredDocuments].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'date':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case 'size':
          comparison = (a.size_bytes || 0) - (b.size_bytes || 0);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [filteredDocuments, sortBy, sortOrder]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.context-menu')) {
        return;
      }
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('contextmenu', handleClickOutside);
    };
  }, [contextMenu]);

  const renderContent = () => {
    if (isInitialLoading && loading) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Loading documents...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-8">
          <div className="bg-destructive/10 border border-destructive rounded-lg p-4">
            <h3 className="text-destructive-foreground font-medium">Error loading documents</h3>
            <p className="text-destructive-foreground mt-2">{error}</p>
          </div>
        </div>
      );
    }

    return (
      <DragDropUpload onFilesDropped={handleFilesDropped}>
        <main className={`flex-1 flex flex-col overflow-hidden bg-background text-foreground ${className}`}>
          <div className="sticky top-0 z-10 border-b border-border bg-card">
            <Toolbar
              searchQuery={searchQuery}
              onSearchChange={handleSearch}
              searchPlaceholder="Search documents..."
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onUpload={() => setShowUploadZone(true)}
              onCreateFolder={handleCreateFolder}
              onRefresh={handleRefresh}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              showFavoritesOnly={showFavoritesOnly}
              onToggleFavorites={handleToggleFavorites}
              selectedCount={selectedItems.length}
              onClearSelection={handleClearSelection}
              onSelectAll={handleSelectAll}
              isUploading={isUploading}
              isLoading={loading || isSearching || isNavigating}
              className=""
            />
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 overflow-auto">
              {(loading || isSearching || isNavigating) && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
                  <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">{
                      isSearching ? 'Searching...' : isNavigating ? 'Navigating...' : 'Loading...'
                    }</span>
                  </div>
                </div>
              )}
              <FileGrid
                documents={sortedDocuments}
                viewMode={viewMode}
                selectedItems={selectedItems}
                searchQuery={searchQuery}
                currentPath={currentPath}
                {...fileGridHandlers}
              />
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-border p-6 bg-card">
            <FavoritesBar
              favorites={favoriteItems}
              currentPath={currentPath}
              onNavigate={handleNavigate}
              onAddFavorite={(path, name) => addFavorite(path, name)}
              onRemoveFavorite={(favoriteId) => {
                const favorite = favorites.find((f) => f.id === favoriteId);
                if (favorite) removeFavorite(favorite.folder_path);
              }}
            />
          </div>

          {contextMenu && (
            <ContextMenu
              isOpen={true}
              position={{ x: contextMenu.x, y: contextMenu.y }}
              documentItem={documents.find((d) => d.id === contextMenu.documentId)}
              onClose={() => setContextMenu(null)}
              onAction={(action, docId) => handleDocumentAction(action, docId)}
              isPublicFolder={documents.find((d) => d.id === contextMenu.documentId)?.is_public_folder || false}
              publicSlug={documents.find((d) => d.id === contextMenu.documentId)?.public_slug || undefined}
              onMakePublic={handleMakePublic}
              onMakePrivate={handleMakePrivate}
              onCopyPublicUrl={handleCopyPublicUrl}
              onGenerateCode={handleGenerateCode}
              className="context-menu"
            />
          )}

          {previewDocument && (
            <Preview
              isOpen={true}
              document={previewDoc}
              documents={documents}
              onClose={() => setPreviewDocument(null)}
              onDownload={(docId) => handleDocumentAction('download', docId)}
              onDelete={(docId) => handleDocumentAction('delete', docId)}
              onNext={(docId) => setPreviewDocument(docId)}
              onPrevious={(docId) => setPreviewDocument(docId)}
            />
          )}

          {/* Enhanced Upload Modal */}
          {showUploadZone && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <h3 className="text-lg font-semibold text-foreground">Upload Files</h3>
                  <button
                    onClick={() => setShowUploadZone(false)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Upload Area */}
                <div className="p-6">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverUploadZone(true);
                    }}
                    onDragLeave={() => setDragOverUploadZone(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverUploadZone(false);
                      const files = Array.from(e.dataTransfer.files);
                      if (files.length > 0) {
                        handleFileUpload(files);
                        setShowUploadZone(false);
                      }
                    }}
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                      dragOverUploadZone
                        ? 'border-primary bg-primary/5 scale-105'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <Upload className={`h-12 w-12 mx-auto mb-4 transition-colors ${
                      dragOverUploadZone ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    
                    <div className="space-y-2">
                      <p className="text-base font-medium text-foreground">
                        {dragOverUploadZone ? 'Drop files here' : 'Drag & drop files here'}
                      </p>
                      <p className="text-sm text-muted-foreground">or</p>
                      <label className="inline-block">
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              handleFileUpload(files);
                              setShowUploadZone(false);
                            }
                          }}
                          className="hidden"
                        />
                        <span className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium cursor-pointer hover:bg-primary/90 transition-colors inline-block">
                          Browse Files
                        </span>
                      </label>
                    </div>

                    <p className="text-xs text-muted-foreground mt-4">
                      Maximum file size: 50MB
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Copy URL Modal */}
          {showCopyUrlModal && copyUrlDocument && (
            <CopyUrlModal
              isOpen={showCopyUrlModal}
              document={copyUrlDocument}
              onClose={() => {
                setShowCopyUrlModal(false);
                setCopyUrlDocument(null);
              }}
            />
          )}
        </main>
      </DragDropUpload>
    );
  };

  return renderContent();
}