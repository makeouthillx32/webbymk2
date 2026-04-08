// app/api/documents/make-private/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { folderId } = await request.json();

    if (!folderId) {
      return NextResponse.json(
        { error: 'Folder ID is required' },
        { status: 400 }
      );
    }

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get the folder to verify ownership
    const { data: folder, error: folderError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', folderId)
      .eq('type', 'folder')
      .single();

    if (folderError || !folder) {
      return NextResponse.json(
        { error: 'Folder not found' },
        { status: 404 }
      );
    }

    // Update folder to make it private
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        is_public_folder: false,
        public_slug: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', folderId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update folder' },
        { status: 500 }
      );
    }

    // Get all files in this folder path and make them private
    const { data: folderFiles, error: filesError } = await supabase
      .from('documents')
      .select('id')
      .eq('type', 'file')
      .like('path', `${folder.path}%`);

    if (filesError) {
      console.error('Error getting folder files:', filesError);
      // Don't fail the request, just log the error
    } else if (folderFiles && folderFiles.length > 0) {
      // Update all files in folder to be private
      const { error: updateFilesError } = await supabase
        .from('documents')
        .update({
          is_public: false,
          updated_at: new Date().toISOString()
        })
        .in('id', folderFiles.map(f => f.id));

      if (updateFilesError) {
        console.error('Error updating folder files:', updateFilesError);
        // Don't fail the request, just log the error
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Folder made private successfully'
    });

  } catch (error) {
    console.error('Make folder private error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}