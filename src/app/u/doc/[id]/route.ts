// app/u/doc/[id]/route.ts
/**
 * Document Access by ID
 * 
 * Short, clean URLs for accessing documents by UUID.
 * 
 * Usage:
 * <img src="/u/doc/51c8979e-9797-45e0-a871-bcd52d59d0f4" />
 * <a href="/u/doc/abc-123-def">Download</a>
 * 
 * Returns 301 redirect to Supabase Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getDocumentUrl } from "@/lib/documents";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    
    const supabase = await createClient();
    
    // Get document by ID
    const { data: document, error } = await supabase
      .from('documents')
      .select('storage_path, mime_type, name')
      .eq('id', id)
      .eq('type', 'file')
      .is('deleted_at', null)
      .single();
    
    if (error || !document || !document.storage_path) {
      return NextResponse.json(
        { 
          error: 'Document not found',
          id 
        }, 
        { status: 404 }
      );
    }
    
    // Get the Supabase public URL
    const fileUrl = getDocumentUrl(document.storage_path);
    
    // Return 301 redirect
    return NextResponse.redirect(fileUrl, {
      status: 301,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': document.mime_type || 'application/octet-stream',
      }
    });
  } catch (error) {
    console.error('Document ID route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return GET(req, context);
}