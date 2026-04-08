// app/api/documents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: document, error } = await supabase
      .from("documents")
      .select(`
        id,
        name,
        path,
        type,
        mime_type,
        size_bytes,
        storage_path,
        bucket_name,
        uploaded_by,
        created_at,
        updated_at,
        is_favorite,
        is_shared,
        tags,
        description,
        visibility,
        uploader:uploaded_by(
          raw_user_meta_data,
          email
        )
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("Document fetch error:", error);
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Log view activity
    await supabase
      .from("document_activity")
      .insert([{
        document_id: id,
        user_id: user.id,
        activity_type: "viewed"
      }]);

    // Transform the data
    const transformedDocument = {
      id: document.id,
      name: document.name,
      path: document.path,
      type: document.type,
      mime_type: document.mime_type,
      size_bytes: document.size_bytes || 0,
      storage_path: document.storage_path,
      bucket_name: document.bucket_name,
      uploaded_by: document.uploaded_by,
      created_at: document.created_at,
      updated_at: document.updated_at,
      is_favorite: document.is_favorite || false,
      is_shared: document.is_shared || false,
      tags: document.tags || [],
      description: document.description,
      visibility: document.visibility,
      uploader_name: document.uploader?.raw_user_meta_data?.display_name || document.uploader?.email?.split('@')[0] || 'Unknown',
      uploader_email: document.uploader?.email || ''
    };

    return NextResponse.json(transformedDocument);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const body = await req.json();
    const { name, tags, is_favorite, description } = body;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate the document exists and user has access
    const { data: existingDoc, error: fetchError } = await supabase
      .from("documents")
      .select("id, name, uploaded_by")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (fetchError || !existingDoc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined) updateData.name = name;
    if (tags !== undefined) updateData.tags = tags;
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
    if (description !== undefined) updateData.description = description;

    const { data: document, error } = await supabase
      .from("documents")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("Document update error:", error);
      return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
    }

    // Log the activity
    const activityType = name && name !== existingDoc.name ? "renamed" : "updated";
    await supabase
      .from("document_activity")
      .insert([{
        document_id: id,
        user_id: user.id,
        activity_type: activityType,
        details: name && name !== existingDoc.name ? { 
          old_name: existingDoc.name, 
          new_name: name 
        } : undefined
      }]);

    console.log(`📝 Updated document: ${id}`);
    return NextResponse.json(document);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use the delete_document function from the database schema
    const { data: affectedCount, error } = await supabase
      .rpc("delete_document", {
        p_document_id: id,
        p_user_id: user.id
      });

    if (error) {
      console.error("Document deletion error:", error);
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }

    console.log(`🗑️ Deleted document: ${id} (affected: ${affectedCount})`);
    return NextResponse.json({ 
      success: true, 
      affected_count: affectedCount 
    });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}