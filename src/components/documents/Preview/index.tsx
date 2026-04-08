// components/documents/Preview/index.tsx - REDESIGNED with Global Card
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentItem } from '@/hooks/useDocuments';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent, 
  CardFooter,
  CardAction 
} from '@/components/ui/card';
import { 
  X, 
  Download, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight,
  RefreshCw
} from 'lucide-react';

interface PreviewProps {
  isOpen: boolean;
  document?: DocumentItem;
  documents?: DocumentItem[]; // For navigation between files
  onClose: () => void;
  onDownload?: (documentId: string) => void;
  onDelete?: (documentId: string) => void;
  onNext?: (documentId: string) => void;
  onPrevious?: (documentId: string) => void;
  className?: string;
}

export default function Preview({
  isOpen,
  document: currentDocument,
  documents = [],
  onClose,
  onDownload,
  onDelete,
  onNext,
  onPrevious,
  className = ''
}: PreviewProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  // Get preview URL for document
  const getPreviewUrl = useCallback((doc: DocumentItem) => {
    if (!doc) return '';
    
    // For images, try to get the actual file URL
    if (doc.mime_type?.startsWith('image/')) {
      return `/api/documents/${doc.id}/download`;
    }
    
    // For PDFs, use PDF.js viewer or similar
    if (doc.mime_type?.includes('pdf')) {
      return `/api/documents/${doc.id}/preview`;
    }
    
    return '';
  }, []);

  // Check if document can be previewed
  const canPreview = useCallback((doc?: DocumentItem) => {
    if (!doc?.mime_type) return false;
    const mimeType = doc.mime_type.toLowerCase();
    return mimeType.startsWith('image/') || 
           mimeType.includes('pdf') || 
           mimeType.startsWith('text/') ||
           mimeType.includes('json');
  }, []);

  // Get current document index for navigation
  const getCurrentIndex = useCallback(() => {
    if (!currentDocument || !documents.length) return -1;
    return documents.findIndex(doc => doc.id === currentDocument.id);
  }, [currentDocument, documents]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    const currentIndex = getCurrentIndex();
    if (currentIndex === -1) return;
    
    // Find next previewable document
    for (let i = currentIndex + 1; i < documents.length; i++) {
      if (canPreview(documents[i])) {
        onNext?.(documents[i].id);
        return;
      }
    }
    
    // Wrap around to beginning
    for (let i = 0; i < currentIndex; i++) {
      if (canPreview(documents[i])) {
        onNext?.(documents[i].id);
        return;
      }
    }
  }, [getCurrentIndex, documents, canPreview, onNext]);

  const handlePrevious = useCallback(() => {
    const currentIndex = getCurrentIndex();
    if (currentIndex === -1) return;
    
    // Find previous previewable document
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (canPreview(documents[i])) {
        onPrevious?.(documents[i].id);
        return;
      }
    }
    
    // Wrap around to end
    for (let i = documents.length - 1; i > currentIndex; i--) {
      if (canPreview(documents[i])) {
        onPrevious?.(documents[i].id);
        return;
      }
    }
  }, [getCurrentIndex, documents, canPreview, onPrevious]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleZoomReset = useCallback(() => {
    setScale(1);
    setRotation(0);
  }, []);

  // Rotation handler
  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
        case 'r':
          e.preventDefault();
          handleRotate();
          break;
        case 'd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            currentDocument && onDownload?.(currentDocument.id);
          }
          break;
      }
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    return () => globalThis.document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrevious, handleZoomIn, handleZoomOut, handleZoomReset, handleRotate, currentDocument, onDownload]);

  // Reset state when document changes
  useEffect(() => {
    setScale(1);
    setRotation(0);
    setError(null);
  }, [currentDocument?.id]);

  if (!isOpen || !currentDocument) return null;

  const previewUrl = getPreviewUrl(currentDocument);
  const currentIndex = getCurrentIndex();
  const totalPreviewable = documents.filter(canPreview).length;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-label="Close preview"
      />
      
      {/* Preview Modal using Global Card */}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none ${className}`}>
        <Card className="w-full max-w-6xl max-h-[90vh] pointer-events-auto overflow-hidden">
          
          {/* Card Header with Controls */}
          <CardHeader className="flex-shrink-0 border-b">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-lg" title={currentDocument.name}>
                  {currentDocument.name}
                </CardTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                  <span>{formatFileSize(currentDocument.size_bytes)}</span>
                  <span>{currentDocument.mime_type}</span>
                  {totalPreviewable > 1 && (
                    <span>
                      {documents.filter((d, i) => i <= currentIndex && canPreview(d)).length} of {totalPreviewable}
                    </span>
                  )}
                </div>
              </div>

              <CardAction>
                <div className="flex items-center gap-2">
                  
                  {/* Navigation Controls */}
                  {totalPreviewable > 1 && (
                    <>
                      <button
                        onClick={handlePrevious}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Previous (←)"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={handleNext}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Next (→)"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      
                      <div className="w-px h-6 bg-border mx-2" />
                    </>
                  )}

                  {/* Zoom Controls (for images) */}
                  {currentDocument.mime_type?.startsWith('image/') && (
                    <>
                      <button
                        onClick={handleZoomOut}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Zoom out (-)"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </button>
                      
                      <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
                        {Math.round(scale * 100)}%
                      </span>
                      
                      <button
                        onClick={handleZoomIn}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Zoom in (+)"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </button>
                      
                      <button
                        onClick={handleZoomReset}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Reset zoom (0)"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>

                      <button
                        onClick={handleRotate}
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Rotate (R)"
                      >
                        <RotateCw className="h-4 w-4" />
                      </button>
                      
                      <div className="w-px h-6 bg-border mx-2" />
                    </>
                  )}

                  {/* Action Buttons */}
                  {onDownload && (
                    <button
                      onClick={() => onDownload(currentDocument.id)}
                      className="p-2 rounded-md hover:bg-muted transition-colors"
                      title="Download (⌘D)"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}

                  {onDelete && (
                    <button
                      onClick={() => onDelete(currentDocument.id)}
                      className="p-2 rounded-md hover:bg-destructive/20 text-destructive transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={onClose}
                    className="p-2 rounded-md hover:bg-muted transition-colors"
                    title="Close (Esc)"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </CardAction>
            </div>
          </CardHeader>

          {/* Card Content - Preview Area */}
          <CardContent className="flex-1 overflow-hidden p-0">
            <div 
              ref={previewRef} 
              className="relative w-full h-[60vh] flex items-center justify-center overflow-hidden"
            >
              
              {/* Loading State */}
              {isLoading && (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
                  <p>Loading preview...</p>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="flex flex-col items-center justify-center text-destructive">
                  <div className="rounded-full bg-destructive/10 p-3 mb-4">
                    <X className="h-8 w-8" />
                  </div>
                  <p className="text-center">{error}</p>
                </div>
              )}

              {/* Image Preview */}
              {currentDocument.mime_type?.startsWith('image/') && !isLoading && !error && (
                <img
                  src={previewUrl}
                  alt={currentDocument.name}
                  className="max-w-full max-h-full object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${scale}) rotate(${rotation}deg)`,
                    transformOrigin: 'center'
                  }}
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setError('Failed to load image');
                    setIsLoading(false);
                  }}
                />
              )}

              {/* PDF Preview */}
              {currentDocument.mime_type?.includes('pdf') && !isLoading && !error && (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0 rounded"
                  title={`Preview of ${currentDocument.name}`}
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setError('Failed to load PDF');
                    setIsLoading(false);
                  }}
                />
              )}

              {/* Text Preview */}
              {(currentDocument.mime_type?.startsWith('text/') || currentDocument.mime_type?.includes('json')) && !isLoading && !error && (
                <div className="w-full h-full overflow-auto p-6">
                  <pre className="text-sm whitespace-pre-wrap">
                    Loading text content...
                  </pre>
                </div>
              )}

              {/* Unsupported File Type */}
              {!canPreview(currentDocument) && (
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <div className="rounded-full bg-muted p-4 mb-4">
                    <Download className="h-8 w-8" />
                  </div>
                  <p className="text-center mb-4">Preview not available for this file type</p>
                  {onDownload && (
                    <button
                      onClick={() => onDownload(currentDocument.id)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Download to view
                    </button>
                  )}
                </div>
              )}
            </div>
          </CardContent>

          {/* Card Footer - Optional additional info */}
          {currentDocument.mime_type?.startsWith('image/') && (
            <CardFooter className="flex-shrink-0 border-t text-sm text-muted-foreground">
              <div className="flex items-center justify-between w-full">
                <span>Use arrow keys to navigate, +/- to zoom, R to rotate</span>
                <span>Press Esc to close</span>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </>
  );
}