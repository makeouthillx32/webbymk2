// app/api/public/assets/[...path]/route.ts - UPDATED FOR FOLDER SLUGS
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Cache headers for different asset types
const getCacheHeaders = (mimeType?: string) => {
  const headers: Record<string, string> = {
    'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
    'Access-Control-Allow-Origin': '*', // Allow CORS for all origins
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  };

  if (mimeType) {
    headers['Content-Type'] = mimeType;
  }

  return headers;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const supabase = await createClient("service");
    const pathParts = params.path;
    
    if (!pathParts || pathParts.length === 0) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      );
    }

    const folderSlug = pathParts[0];
    const fileName = pathParts.slice(1).join('/');

    // If no filename provided, return folder contents
    if (!fileName) {
      return getFolderContents(supabase, folderSlug, request);
    }

    // Find the public folder by slug
    const { data: publicFolder, error: folderError } = await supabase
      .from('documents')
      .select('id, path, name, is_public_folder')
      .eq('public_slug', folderSlug)
      .eq('type', 'folder')
      .eq('is_public_folder', true)
      .single();

    if (folderError || !publicFolder) {
      return NextResponse.json(
        { error: 'Public folder not found' },
        { status: 404 }
      );
    }

    // Construct the full file path
    const fullFilePath = `${publicFolder.path}/${fileName}`;

    // Get the specific file from the public folder
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, name, mime_type, size_bytes, path, is_public')
      .eq('path', fullFilePath)
      .eq('type', 'file')
      .eq('is_public', true) // Only serve public files
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Asset not found in public folder' },
        { status: 404 }
      );
    }

    // Get the actual file from storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from('documents')
      .download(fullFilePath);

    if (storageError || !fileData) {
      console.error('Storage error:', storageError);
      return NextResponse.json(
        { error: 'Failed to retrieve asset from storage' },
        { status: 500 }
      );
    }

    // Convert to buffer
    const buffer = await fileData.arrayBuffer();
    
    return new NextResponse(buffer, {
      status: 200,
      headers: getCacheHeaders(document.mime_type)
    });

  } catch (error) {
    console.error('Public asset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Function to return folder contents (when no filename is provided)
async function getFolderContents(
  supabase: any,
  folderSlug: string,
  request: NextRequest
) {
  try {
    // Get the public folder
    const { data: publicFolder, error: folderError } = await supabase
      .from('documents')
      .select('id, path, name, is_public_folder')
      .eq('public_slug', folderSlug)
      .eq('type', 'folder')
      .eq('is_public_folder', true)
      .single();

    if (folderError || !publicFolder) {
      return NextResponse.json(
        { error: 'Public folder not found' },
        { status: 404 }
      );
    }

    // Get all public files in this folder
    const { data: files, error: filesError } = await supabase
      .from('documents')
      .select('name, mime_type, size_bytes, created_at, path')
      .like('path', `${publicFolder.path}%`)
      .eq('type', 'file')
      .eq('is_public', true)
      .order('name');

    if (filesError) {
      return NextResponse.json(
        { error: 'Failed to get folder contents' },
        { status: 500 }
      );
    }

    const baseUrl = new URL(request.url).origin;
    const assetsWithUrls = files.map(file => {
      // Extract just the filename from the full path
      const fileName = file.path.replace(`${publicFolder.path}/`, '');
      return {
        name: fileName,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        created_at: file.created_at,
        public_url: `${baseUrl}/api/public/assets/${folderSlug}/${fileName}`
      };
    });

    return NextResponse.json({
      folder: {
        name: publicFolder.name,
        slug: folderSlug,
        file_count: files.length
      },
      assets: assetsWithUrls
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 minutes cache for folder listings
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Folder contents error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // Same logic as GET but only return headers
  const getResponse = await GET(request, { params });
  return new NextResponse(null, {
    status: getResponse.status,
    headers: getResponse.headers
  });
}

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}