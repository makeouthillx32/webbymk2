// app/cdn/[...path]/route.ts
/**
 * CDN-Style File Access
 * 
 * Provides clean, CDN-like URLs that redirect to Supabase Storage.
 * 
 * Usage in HTML:
 * <img src="/cdn/public/tin-haul-boot.webp" />
 * <img src="/cdn/images/hero-banner.jpg" />
 * <video src="/cdn/videos/promo.mp4" />
 * 
 * Automatically handles:
 * - Folder paths: /cdn/public/file.jpg
 * - Deep paths: /cdn/images/products/boot.webp
 * - URL redirects to actual Supabase storage (301)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getDocumentUrl } from "@/lib/documents";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await context.params;
    
    if (!path || path.length === 0) {
      return NextResponse.json(
        { error: 'Path required' }, 
        { status: 400 }
      );
    }
    
    // Reconstruct full path from segments
    // Example: ["public", "tin-haul-boot.webp"] -> "public/tin-haul-boot.webp"
    const fullPath = path.join('/');
    
    const supabase = await createClient();
    
    // Try to find document by exact path match first
    let { data: document, error } = await supabase
      .from('documents')
      .select('storage_path, mime_type')
      .eq('path', fullPath)
      .eq('type', 'file')
      .is('deleted_at', null)
      .single();
    
    // If not found by path, try to find by name in parent folder
    if (error || !document) {
      const fileName = path[path.length - 1];
      const folderPath = path.slice(0, -1).join('/') + '/';
      
      const { data: docByName } = await supabase
        .from('documents')
        .select('storage_path, mime_type')
        .eq('name', fileName)
        .eq('parent_path', folderPath)
        .eq('type', 'file')
        .is('deleted_at', null)
        .single();
      
      document = docByName;
    }
    
    if (!document || !document.storage_path) {
      return NextResponse.json(
        { 
          error: 'File not found',
          path: fullPath,
          hint: 'Check that the file exists and path is correct'
        }, 
        { status: 404 }
      );
    }
    
    // Get the Supabase public URL
    const fileUrl = getDocumentUrl(document.storage_path);
    
    // Return 301 redirect to Supabase
    return NextResponse.redirect(fileUrl, {
      status: 301, // Permanent redirect - browsers can cache
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': document.mime_type || 'application/octet-stream',
      }
    });
  } catch (error) {
    console.error('CDN route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

// Support HEAD requests for checking file existence
export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return GET(req, context);
}