// app/api/public/documents/route.ts
/**
 * Public Document Access API
 * 
 * GET /api/public/documents?folder=public
 * GET /api/public/documents?id=uuid
 * GET /api/public/documents (lists all public folders)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getDocumentUrl } from "@/lib/documents";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    
    const folder = searchParams.get('folder');
    const documentId = searchParams.get('id');

    // Get document by ID
    if (documentId) {
      const { data: document, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .is('deleted_at', null)
        .single();

      if (error || !document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: document.id,
        name: document.name,
        type: document.type,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes,
        url: document.storage_path ? getDocumentUrl(document.storage_path) : null,
        storage_path: document.storage_path,
        tags: document.tags,
        created_at: document.created_at,
      });
    }

    // Get documents in a folder
    if (folder) {
      const folderPath = folder.endsWith('/') ? folder : `${folder}/`;
      
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('parent_path', folderPath)
        .is('deleted_at', null)
        .order('name');

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
      }

      return NextResponse.json({
        folder: folderPath,
        count: documents?.length || 0,
        documents: (documents || []).map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          url: doc.storage_path ? getDocumentUrl(doc.storage_path) : null,
          storage_path: doc.storage_path,
          tags: doc.tags,
          created_at: doc.created_at,
        }))
      });
    }

    // List all public folders
    const { data: folders, error } = await supabase
      .from('documents')
      .select('*')
      .eq('type', 'folder')
      .eq('is_public_folder', true)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }

    return NextResponse.json({
      public_folders: (folders || []).map(folder => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        public_slug: folder.public_slug,
        created_at: folder.created_at,
      }))
    });

  } catch (error) {
    console.error('Public documents API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}