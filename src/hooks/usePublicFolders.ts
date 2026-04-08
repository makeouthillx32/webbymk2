// hooks/usePublicFolders.ts - FIXED CLIENT-SIDE VERSION
import { useState, useCallback, useEffect } from 'react';
import { useDocuments } from './useDocuments';

interface PublicFolder {
  id: string;
  name: string;
  path: string;
  public_slug: string;
  is_public_folder: boolean;
  created_at: string;
  file_count: number;
  public_url: string;
}

interface PublicFolderHook {
  publicFolders: PublicFolder[];
  makefolderPublic: (folderId: string, slug?: string) => Promise<void>;
  makeFolderPrivate: (folderId: string) => Promise<void>;
  generateFolderSlug: (folderName: string) => string;
  getPublicAssetUrl: (folderSlug: string, fileName: string) => string;
  copyFolderUrl: (folderSlug: string) => void;
  generateUsageExample: (folderSlug: string, fileName?: string) => string;
  loading: boolean;
  error: string | null;
}

export function usePublicFolders(): PublicFolderHook {
  const { documents, fetchDocuments } = useDocuments();
  const [publicFolders, setPublicFolders] = useState<PublicFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate URL-friendly slug from folder name
  const generateFolderSlug = useCallback((folderName: string): string => {
    return folderName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }, []);

  // Get public asset URL
  const getPublicAssetUrl = useCallback((folderSlug: string, fileName: string): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return fileName 
      ? `${baseUrl}/api/public/assets/${folderSlug}/${fileName}`
      : `${baseUrl}/api/public/assets/${folderSlug}/`;
  }, []);

  // Filter and transform folders into public folders - FIXED: moved generateFolderSlug and getPublicAssetUrl above
  useEffect(() => {
    const folders = documents
      .filter(doc => doc.type === 'folder' && doc.is_public_folder)
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        public_slug: folder.public_slug || generateFolderSlug(folder.name),
        is_public_folder: folder.is_public_folder || false,
        created_at: folder.created_at,
        file_count: documents.filter(f => f.path.startsWith(folder.path) && f.type === 'file').length,
        public_url: getPublicAssetUrl(folder.public_slug || generateFolderSlug(folder.name), '')
      }));
    
    setPublicFolders(folders);
  }, [documents, generateFolderSlug, getPublicAssetUrl]);

  // Make folder public with optional custom slug
  const makefolderPublic = useCallback(async (folderId: string, customSlug?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🎯 makefolderPublic called with folderId:', folderId, 'customSlug:', customSlug);
      
      const folder = documents.find(d => d.id === folderId);
      if (!folder) {
        throw new Error('Folder not found');
      }

      const slug = customSlug || generateFolderSlug(folder.name);
      console.log('🎯 Generated slug:', slug);
      
      // SIMPLIFIED: Remove client-side slug check - let the server handle it
      // The server does a more reliable database check anyway
      
      console.log('🎯 Calling API with payload:', { folderId, publicSlug: slug });

      // Call API to make folder public
      const response = await fetch('/api/documents/make-public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId,
          publicSlug: slug
        })
      });

      console.log('🎯 API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('🎯 API error response:', errorData);
        throw new Error(errorData.error || 'Failed to make folder public');
      }

      const responseData = await response.json();
      console.log('🎯 API success response:', responseData);

      // Refresh documents to get updated data
      await fetchDocuments();
      console.log('🎯 Documents refreshed successfully');
      
    } catch (err) {
      console.error('🎯 makefolderPublic error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to make folder public';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [documents, fetchDocuments, generateFolderSlug]);

  // Make folder private
  const makeFolderPrivate = useCallback(async (folderId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('🎯 makeFolderPrivate called with folderId:', folderId);
      
      // Call API to make folder private
      const response = await fetch('/api/documents/make-private', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId
        })
      });

      console.log('🎯 Make private API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('🎯 Make private API error response:', errorData);
        throw new Error(errorData.error || 'Failed to make folder private');
      }

      const responseData = await response.json();
      console.log('🎯 Make private API success response:', responseData);

      // Refresh documents to get updated data
      await fetchDocuments();
      console.log('🎯 Documents refreshed successfully after making private');
      
    } catch (err) {
      console.error('🎯 makeFolderPrivate error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to make folder private';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchDocuments]);

  // Copy folder URL to clipboard
  const copyFolderUrl = useCallback((folderSlug: string) => {
    const url = getPublicAssetUrl(folderSlug, '');
    navigator.clipboard.writeText(url).then(() => {
      console.log('🎯 Folder URL copied to clipboard:', url);
    }).catch(err => {
      console.error('🎯 Failed to copy URL:', err);
    });
  }, [getPublicAssetUrl]);

  // Generate usage example code
  const generateUsageExample = useCallback((folderSlug: string, fileName?: string): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    
    if (fileName) {
      // Specific file example
      const url = `${baseUrl}/api/public/assets/${folderSlug}/${fileName}`;
      return `// Next.js Image Component
<Image
  src="${url}"
  alt="Company asset"
  width={400}
  height={300}
  className="rounded-lg"
/>

// Regular HTML img tag
<img 
  src="${url}" 
  alt="Company asset"
  className="rounded-lg w-full h-auto"
/>

// CSS background image
background-image: url('${url}');`;
    } else {
      // Folder access example
      return `// Access any image in the ${folderSlug} folder:
const imageUrl = "${baseUrl}/api/public/assets/${folderSlug}/your-image.jpg"

// Example usage:
<Image
  src="${baseUrl}/api/public/assets/${folderSlug}/logo.png"
  alt="Company logo"
  width={200}
  height={100}
/>`;
    }
  }, []);

  return {
    publicFolders,
    makefolderPublic,
    makeFolderPrivate,
    generateFolderSlug,
    getPublicAssetUrl,
    copyFolderUrl,
    generateUsageExample,
    loading,
    error
  };
}