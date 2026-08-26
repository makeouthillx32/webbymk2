// app/api/documents/make-public/route.ts - FIXED VERSION WITH BETTER DEBUGGING
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  console.log('🎯 Make public API called');
  
  try {
    const supabase = await createClient();
    const body = await request.json();
    console.log('🎯 Request body:', body);
    
    const { folderId, publicSlug } = body;

    if (!folderId || !publicSlug) {
      console.error('🎯 Missing required fields:', { folderId, publicSlug });
      return NextResponse.json(
        { error: 'Folder ID and public slug are required' },
        { status: 400 }
      );
    }

    // Get the current user
    console.log('🎯 Getting current user...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('🎯 User authentication failed:', userError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.log('🎯 User authenticated:', user.id);

    // FIXED: Check if slug already exists - use .maybeSingle() instead of .single()
    console.log('🎯 Checking if slug exists:', publicSlug);
    const { data: existingFolder, error: slugCheckError } = await supabase
      .from('documents')
      .select('id')
      .eq('public_slug', publicSlug)
      .eq('type', 'folder')
      .neq('id', folderId)
      .maybeSingle(); // Use maybeSingle instead of single

    // FIXED: Better error handling
    if (slugCheckError) {
      console.error('🎯 Slug check error:', slugCheckError);
      return NextResponse.json(
        { error: `Database error checking slug uniqueness: ${slugCheckError.message}` },
        { status: 500 }
      );
    }

    console.log('🎯 Existing folder check result:', existingFolder);

    // FIXED: Now existingFolder will be null if no match, not an error
    if (existingFolder) {
      console.log('🎯 Slug already exists:', publicSlug);
      return NextResponse.json(
        { error: 'Public slug already exists. Please choose a different one.' },
        { status: 409 }
      );
    }

    // Get the folder to verify ownership - also use maybeSingle for consistency
    console.log('🎯 Getting folder details for:', folderId);
    
    const { data: folder, error: folderError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', folderId)
      .eq('type', 'folder')
      .maybeSingle();

    if (folderError) {
      console.error('🎯 Folder lookup error:', folderError);
      return NextResponse.json(
        { error: `Database error looking up folder: ${folderError.message}` },
        { status: 500 }
      );
    }

    if (!folder) {
      console.log('🎯 Folder not found:', folderId);
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      );
    }

    console.log('🎯 Found folder:', { id: folder.id, name: folder.name, path: folder.path });

    // Update folder to make it public
    console.log('🎯 Updating folder to be public...');
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        is_public_folder: true,
        public_slug: publicSlug,
        updated_at: new Date().toISOString()
      })
      .eq('id', folderId);

    if (updateError) {
      console.error('🎯 Folder update error:', updateError);
      return NextResponse.json(
        { error: `Failed to update folder: ${updateError.message}` },
        { status: 500 }
      );
    }

    console.log('🎯 Folder updated successfully');

    // Get all files in this folder path and make them public
    console.log('🎯 Looking for files in folder path:', folder.path);
    const { data: folderFiles, error: filesError } = await supabase
      .from('documents')
      .select('id')
      .eq('type', 'file')
      .like('path', `${folder.path}%`)
      .ilike('mime_type', 'image/%'); // Only make images public

    if (filesError) {
      console.error('🎯 Error getting folder files:', filesError);
      // Don't fail the request, just log the error
    } else {
      console.log('🎯 Found files to make public:', folderFiles?.length || 0);
      
      if (folderFiles && folderFiles.length > 0) {
        // Update all images in folder to be public
        const { error: updateFilesError } = await supabase
          .from('documents')
          .update({
            is_public: true,
            updated_at: new Date().toISOString()
          })
          .in('id', folderFiles.map(f => f.id));

        if (updateFilesError) {
          console.error('🎯 Error updating folder files:', updateFilesError);
          // Don't fail the request, just log the error
        } else {
          console.log('🎯 Updated files to be public');
        }
      }
    }

    const successResponse = {
      success: true,
      message: 'Folder made public successfully',
      publicSlug,
      publicUrl: `${request.nextUrl.origin}/api/public/assets/${publicSlug}/`
    };

    console.log('🎯 Success response:', successResponse);

    return NextResponse.json(successResponse);

  } catch (error) {
    console.error('🎯 Make folder public error:', error);
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}