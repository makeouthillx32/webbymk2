// lib/documents-server.ts
/**
 * Server-only Document Helpers
 * 
 * These functions use Supabase createServerClient and can ONLY be used in:
 * - Server Components
 * - API Routes
 * - Server Actions
 * 
 * DO NOT import this file in client components!
 */

import { createClient } from '@/utils/supabase/server';
import { getDocumentUrl, getDimensionsFromTags, getResolution, isImage } from './documents';

/**
 * Get all documents in a specific folder (server-side)
 */
export async function getDocumentsByFolder(folderPath: string) {
  const supabase = await createClient();
  
  const normalizedPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  
  const { data: documents, error } = await supabase
    .from('documents')
    .select('*')
    .eq('parent_path', normalizedPath)
    .is('deleted_at', null)
    .order('name');
  
  if (error) {
    console.error('Error fetching documents:', error);
    return [];
  }
  
  return (documents || []).map(doc => ({
    ...doc,
    url: doc.storage_path ? getDocumentUrl(doc.storage_path) : null,
    dimensions: getDimensionsFromTags(doc.tags),
    resolution: getResolution(doc.tags),
  }));
}

/**
 * Get a single document by ID (server-side)
 */
export async function getDocumentById(documentId: string) {
  const supabase = await createClient();
  
  const { data: document, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .is('deleted_at', null)
    .single();
  
  if (error || !document) {
    console.error('Error fetching document:', error);
    return null;
  }
  
  return {
    ...document,
    url: document.storage_path ? getDocumentUrl(document.storage_path) : null,
    dimensions: getDimensionsFromTags(document.tags),
    resolution: getResolution(document.tags),
  };
}

/**
 * Get all public folders (server-side)
 */
export async function getPublicFolders() {
  const supabase = await createClient();
  
  const { data: folders, error } = await supabase
    .from('documents')
    .select('*')
    .eq('type', 'folder')
    .eq('is_public_folder', true)
    .is('deleted_at', null)
    .order('name');
  
  if (error) {
    console.error('Error fetching public folders:', error);
    return [];
  }
  
  return folders || [];
}

/**
 * Get all folders (server-side)
 */
export async function getAllFolders() {
  const supabase = await createClient();
  
  const { data: folders, error } = await supabase
    .from('documents')
    .select('*')
    .eq('type', 'folder')
    .is('deleted_at', null)
    .order('name');
  
  if (error) {
    console.error('Error fetching folders:', error);
    return [];
  }
  
  return folders || [];
}

/**
 * Get all images in a folder (server-side)
 */
export async function getImagesByFolder(folderPath: string) {
  const documents = await getDocumentsByFolder(folderPath);
  return documents.filter(doc => isImage(doc.mime_type));
}

/**
 * Find a document by name in a folder (server-side)
 */
export async function findDocumentByName(folderPath: string, fileName: string) {
  const documents = await getDocumentsByFolder(folderPath);
  return documents.find(doc => doc.name === fileName) || null;
}