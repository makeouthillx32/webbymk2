import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';

export interface DocumentItem {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  mime_type?: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  is_shared: boolean;
  tags: string[];
  uploader_name?: string;
  uploader_email?: string;
}

export interface DocumentActivity {
  id: string;
  document_id: string;
  user_id: string;
  activity_type: string;
  details?: any;
  created_at: string;
  user?: {
    email: string;
    raw_user_meta_data?: any;
  };
}

interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  result?: any;
}

interface FolderFavorite {
  id: string;
  user_id: string;
  folder_path: string;
  folder_name: string;
  created_at: string;
}

interface ShareDocument {
  documentId: string;
  sharedWithUserId?: string;
  sharedWithRole?: string;
  permissionLevel: 'read' | 'write' | 'admin';
  expiresAt?: string;
}

export function useDocuments(initialFolderPath: string = '') {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState(initialFolderPath);

  const fetchDocuments = useCallback(async (folderPath: string = currentPath) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (folderPath) params.append('folder', folderPath);
      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch documents';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const searchDocuments = useCallback(async (query: string, folderPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ search: query });
      if (folderPath) params.append('folder', folderPath);
      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      const data = await response.json();
      setDocuments(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const navigateToFolder = useCallback((path: string) => {
    // Ensure path is a string
    const safePath = typeof path === 'string' ? path : String(path);
    setCurrentPath(safePath);
    fetchDocuments(safePath);
  }, [fetchDocuments]);

  const createFolder = useCallback(async (name: string, parentPath?: string) => {
    try {
      const folderPath = parentPath ? `${parentPath}${name}/` : `${name}/`;
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'folder',
          name,
          path: folderPath,
          parentPath: parentPath || null
        })
      });
      if (!response.ok) {
        throw new Error(`Failed to create folder: ${response.statusText}`);
      }
      const newFolder = await response.json();
      toast.success(`Folder "${name}" created successfully`);
      await fetchDocuments();
      return newFolder;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create folder';
      toast.error(errorMessage);
      throw err;
    }
  }, [fetchDocuments]);

  const updateDocument = useCallback(async (
    documentId: string, 
    updates: Partial<Pick<DocumentItem, 'name' | 'tags' | 'is_favorite'>>
  ) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error(`Failed to update document: ${response.statusText}`);
      }
      const updatedDocument = await response.json();
      setDocuments(prev => 
        prev.map(doc => doc.id === documentId ? { ...doc, ...updatedDocument } : doc)
      );
      toast.success('Document updated successfully');
      return updatedDocument;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update document';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`);
      }
      const result = await response.json();
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      toast.success(result.message || 'Document deleted successfully');
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      toast.error(errorMessage);
      throw err;
    }
  }, []);

  const moveDocument = useCallback(async (documentId: string, newPath: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath })
      });
      if (!response.ok) {
        throw new Error(`Failed to move document: ${response.statusText}`);
      }
      const result = await response.json();
      toast.success(result.message || 'Document moved successfully');
      await fetchDocuments();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to move document';
      toast.error(errorMessage);
      throw err;
    }
  }, [fetchDocuments]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    loading,
    error,
    currentPath,
    fetchDocuments,
    searchDocuments,
    navigateToFolder,
    createFolder,
    updateDocument,
    deleteDocument,
    moveDocument
  };
}

export function useFileUpload() {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = useCallback(async (
    files: File[], 
    folderPath: string = '',
    options?: {
      description?: string;
      tags?: string[];
      onProgress?: (fileId: string, progress: number) => void;
    }
  ) => {
    setIsUploading(true);
    const uploadMap = new Map<string, UploadProgress>();
    files.forEach(file => {
      const fileId = `${file.name}-${Date.now()}-${Math.random()}`;
      uploadMap.set(fileId, {
        file,
        progress: 0,
        status: 'pending'
      });
    });
    setUploads(uploadMap);
    const results = [];
    try {
      for (const [fileId, uploadInfo] of uploadMap.entries()) {
        try {
          uploadMap.set(fileId, { ...uploadInfo, status: 'uploading' });
          setUploads(new Map(uploadMap));
          const formData = new FormData();
          formData.append('file', uploadInfo.file);
          formData.append('folderPath', folderPath);
          if (options?.description) {
            formData.append('description', options.description);
          }
          if (options?.tags) {
            formData.append('tags', JSON.stringify(options.tags));
          }
          const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
          });
          if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
          }
          const result = await response.json();
          uploadMap.set(fileId, {
            ...uploadInfo,
            progress: 100,
            status: 'completed',
            result
          });
          results.push(result);
          toast.success(`${uploadInfo.file.name} uploaded successfully`);
          options?.onProgress?.(fileId, 100);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          uploadMap.set(fileId, {
            ...uploadInfo,
            status: 'error',
            error: errorMessage
          });
          toast.error(`${uploadInfo.file.name}: ${errorMessage}`);
        }
        setUploads(new Map(uploadMap));
      }
      return results;
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploads(new Map());
      }, 3000);
    }
  }, []);

  const clearUploads = useCallback(() => {
    setUploads(new Map());
  }, []);

  const cancelUpload = useCallback((fileId: string) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      const upload = newMap.get(fileId);
      if (upload && upload.status === 'uploading') {
        newMap.set(fileId, { ...upload, status: 'error', error: 'Cancelled by user' });
      }
      return newMap;
    });
  }, []);

  return {
    uploads: Array.from(uploads.entries()).map(([id, upload]) => ({ id, ...upload })),
    isUploading,
    uploadFiles,
    clearUploads,
    cancelUpload
  };
}

export function useFolderFavorites() {
  const [favorites, setFavorites] = useState<FolderFavorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/documents/favorites');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setFavorites(Array.isArray(data) ? data : []);
      console.log('✅ Favorites fetched successfully:', data.length);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch favorites';
      setError(errorMessage);
      console.error('❌ Error fetching favorites:', error);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const addFavorite = useCallback(async (folderPath: string, folderName: string) => {
    if (!folderPath || !folderName) {
      const errorMsg = 'Folder path and name are required';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }
    const cleanFolderPath = folderPath.trim();
    const cleanFolderName = folderName.trim();
    if (cleanFolderPath.length === 0 || cleanFolderName.length === 0) {
      const errorMsg = 'Folder path and name cannot be empty';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }
    const existingFavorite = favorites.find(fav => fav.folder_path === cleanFolderPath);
    if (existingFavorite) {
      const errorMsg = 'This folder is already in your favorites';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }
    console.log('📌 Adding favorite:', { folderPath: cleanFolderPath, folderName: cleanFolderName });
    try {
      const response = await fetch('/api/documents/favorites', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ 
          folderPath: cleanFolderPath, 
          folderName: cleanFolderName 
        })
      });
      let responseData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response:', textResponse);
        throw new Error('Server returned invalid response format');
      }
      if (!response.ok) {
        const errorMessage = responseData?.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('❌ Add favorite API error:', {
          status: response.status,
          statusText: response.statusText,
          error: responseData
        });
        if (response.status === 401) {
          throw new Error('You must be logged in to add favorites');
        } else if (response.status === 409) {
          throw new Error('This folder is already in your favorites');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        } else {
          throw new Error(errorMessage);
        }
      }
      if (!responseData || typeof responseData !== 'object') {
        throw new Error('Invalid response from server');
      }
      setFavorites(prev => [responseData, ...prev]);
      toast.success(`Added "${cleanFolderName}" to favorites`);
      console.log('✅ Favorite added successfully:', responseData);
      return responseData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add favorite';
      console.error('❌ Add favorite error:', error);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [favorites]);

  const removeFavorite = useCallback(async (folderPath: string) => {
    if (!folderPath) {
      const errorMsg = 'Folder path is required';
      toast.error(errorMsg);
      throw new Error(errorMsg);
    }
    const cleanFolderPath = folderPath.trim();
    console.log('🗑️ Removing favorite:', cleanFolderPath);
    try {
      const response = await fetch(`/api/documents/favorites?folderPath=${encodeURIComponent(cleanFolderPath)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json'
        }
      });
      let responseData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = { success: response.ok };
      }
      if (!response.ok) {
        const errorMessage = responseData?.error || `HTTP ${response.status}: ${response.statusText}`;
        console.error('❌ Remove favorite API error:', {
          status: response.status,
          statusText: response.statusText,
          error: responseData
        });
        if (response.status === 401) {
          throw new Error('You must be logged in to remove favorites');
        } else if (response.status === 404) {
          setFavorites(prev => prev.filter(fav => fav.folder_path !== cleanFolderPath));
          toast.success('Removed from favorites');
          return;
        } else {
          throw new Error(errorMessage);
        }
      }
      const removedFavorite = favorites.find(fav => fav.folder_path === cleanFolderPath);
      setFavorites(prev => prev.filter(fav => fav.folder_path !== cleanFolderPath));
      if (removedFavorite) {
        toast.success(`Removed "${removedFavorite.folder_name}" from favorites`);
      } else {
        toast.success('Removed from favorites');
      }
      console.log('✅ Favorite removed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove favorite';
      console.error('❌ Remove favorite error:', error);
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [favorites]);

  const isFavorite = useCallback((folderPath: string) => {
    if (!folderPath) return false;
    return favorites.some(fav => fav.folder_path === folderPath.trim());
  }, [favorites]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    isFavorite,
    refetch: fetchFavorites
  };
}

export function useDocumentActivity(documentId: string) {
  const [activity, setActivity] = useState<DocumentActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(async (limit: number = 20) => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/activity/${documentId}?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch activity: ${response.statusText}`);
      }
      const data = await response.json();
      setActivity(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch activity';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return {
    activity,
    loading,
    error,
    refetch: fetchActivity
  };
}

export function useDocumentSharing() {
  const [sharing, setSharing] = useState(false);

  const shareDocument = useCallback(async (shareData: ShareDocument) => {
    setSharing(true);
    try {
      const response = await fetch('/api/documents/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareData)
      });
      if (!response.ok) {
        throw new Error('Failed to share document');
      }
      const result = await response.json();
      toast.success('Document shared successfully');
      return result;
    } catch (error) {
      toast.error('Failed to share document');
      throw error;
    } finally {
      setSharing(false);
    }
  }, []);

  return {
    shareDocument,
    sharing
  };
}