// app/u/img/[slug]/route.ts
/**
 * Image Access by Friendly Slug
 * 
 * Pretty URLs for images using slugified names.
 * 
 * Usage:
 * <img src="/u/img/tin-haul-boot" />
 * <img src="/u/img/roper-106" />
 * <img src="/u/img/hero-banner" />
 * 
 * Automatically finds images by matching against slugified file names.
 * Returns 301 redirect to Supabase Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getDocumentUrl } from "@/lib/documents";

/**
 * Slugify a filename for matching
 * "TInHaul_5.webp" -> "tinhaul-5"
 * "Roper_106.avif" -> "roper-106"
 */
function slugifyFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[_\s]+/g, '-')  // Replace _ and spaces with -
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except -
    .replace(/-+/g, '-')        // Replace multiple - with single -
    .replace(/^-|-$/g, '');     // Remove leading/trailing -
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    
    const supabase = await createClient();
    
    // Get all image files
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name, storage_path, mime_type')
      .eq('type', 'file')
      .like('mime_type', 'image/%')
      .is('deleted_at', null);
    
    if (error || !documents) {
      return NextResponse.json(
        { error: 'Failed to search images' }, 
        { status: 500 }
      );
    }
    
    // Find image by matching slug
    const document = documents.find(doc => 
      slugifyFileName(doc.name) === slug.toLowerCase()
    );
    
    if (!document || !document.storage_path) {
      return NextResponse.json(
        { 
          error: 'Image not found',
          slug,
          hint: 'Try searching with a different slug or use /cdn/folder/filename.ext'
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
        'Content-Type': document.mime_type || 'image/jpeg',
      }
    });
  } catch (error) {
    console.error('Image slug route error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  return GET(req, context);
}