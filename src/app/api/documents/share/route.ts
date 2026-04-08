// app/api/documents/share/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const { 
      documentId, 
      sharedWithUserId, 
      sharedWithRole, 
      permissionLevel, 
      expiresAt 
    } = body;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    if (!documentId || !permissionLevel) {
      return NextResponse.json({ error: "documentId and permissionLevel are required" }, { status: 400 });
    }

    if (!sharedWithUserId && !sharedWithRole) {
      return NextResponse.json({ error: "Either sharedWithUserId or sharedWithRole is required" }, { status: 400 });
    }

    // Verify document exists and user has permission to share
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, name, uploaded_by, type")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Check if user has permission to share (owner or admin permissions)
    if (document.uploaded_by !== user.id) {
      // Check if user has admin share permissions
      const { data: existingShare, error: shareCheckError } = await supabase
        .from("document_shares")
        .select("permission_level")
        .eq("document_id", documentId)
        .eq("shared_with_user_id", user.id)
        .single();

      if (shareCheckError || !existingShare || existingShare.permission_level !== "admin") {
        return NextResponse.json({ error: "Insufficient permissions to share this document" }, { status: 403 });
      }
    }

    // Check if share already exists
    let whereClause = supabase
      .from("document_shares")
      .select("id, permission_level")
      .eq("document_id", documentId);

    if (sharedWithUserId) {
      whereClause = whereClause.eq("shared_with_user_id", sharedWithUserId);
    } else if (sharedWithRole) {
      whereClause = whereClause.eq("shared_with_role", sharedWithRole);
    }

    const { data: existingShare, error: existingError } = await whereClause.single();

    if (existingError && existingError.code !== "PGRST116") { // PGRST116 = no rows returned
      console.error("Check existing share error:", existingError);
      return NextResponse.json({ error: "Failed to check existing share" }, { status: 500 });
    }

    // Create or update share
    const shareData = {
      document_id: documentId,
      shared_with_user_id: sharedWithUserId || null,
      shared_with_role: sharedWithRole || null,
      permission_level: permissionLevel,
      shared_by: user.id,
      expires_at: expiresAt || null,
      is_public_link: false
    };

    let share;
    if (existingShare) {
      // Update existing share
      const { data: updatedShare, error: updateError } = await supabase
        .from("document_shares")
        .update({
          permission_level: permissionLevel,
          expires_at: expiresAt || null,
          shared_at: new Date().toISOString()
        })
        .eq("id", existingShare.id)
        .select("*")
        .single();

      if (updateError) {
        console.error("Share update error:", updateError);
        return NextResponse.json({ error: "Failed to update share" }, { status: 500 });
      }
      share = updatedShare;
    } else {
      // Create new share
      const { data: newShare, error: createError } = await supabase
        .from("document_shares")
        .insert([shareData])
        .select("*")
        .single();

      if (createError) {
        console.error("Share creation error:", createError);
        return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
      }
      share = newShare;
    }

    // Update document's is_shared flag
    await supabase
      .from("documents")
      .update({ is_shared: true })
      .eq("id", documentId);

    // Log sharing activity
    await supabase
      .from("document_activity")
      .insert([{
        document_id: documentId,
        user_id: user.id,
        activity_type: "shared",
        details: {
          shared_with_user_id: sharedWithUserId,
          shared_with_role: sharedWithRole,
          permission_level: permissionLevel
        }
      }]);

    console.log(`🔗 Shared document: ${documentId} with ${sharedWithUserId || sharedWithRole}`);
    return NextResponse.json({
      success: true,
      share,
      message: "Document shared successfully"
    });

  } catch (error) {
    console.error("Share API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("documentId");

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Fetch shares for the document
    const { data: shares, error } = await supabase
      .from("document_shares")
      .select(`
        id,
        document_id,
        shared_with_user_id,
        shared_with_role,
        permission_level,
        shared_by,
        shared_at,
        expires_at,
        is_public_link,
        share_token,
        shared_with_user:shared_with_user_id(
          email,
          raw_user_meta_data
        ),
        shared_by_user:shared_by(
          email,
          raw_user_meta_data
        )
      `)
      .eq("document_id", documentId)
      .order("shared_at", { ascending: false });

    if (error) {
      console.error("Shares fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch shares" }, { status: 500 });
    }

    // Transform the data
    const transformedShares = shares?.map(share => ({
      id: share.id,
      document_id: share.document_id,
      shared_with_user_id: share.shared_with_user_id,
      shared_with_role: share.shared_with_role,
      permission_level: share.permission_level,
      shared_by: share.shared_by,
      shared_at: share.shared_at,
      expires_at: share.expires_at,
      is_public_link: share.is_public_link,
      share_token: share.share_token,
      shared_with_user: share.shared_with_user ? {
        email: share.shared_with_user.email,
        name: share.shared_with_user.raw_user_meta_data?.display_name || 
              share.shared_with_user.email?.split('@')[0] || 'Unknown'
      } : null,
      shared_by_user: share.shared_by_user ? {
        email: share.shared_by_user.email,
        name: share.shared_by_user.raw_user_meta_data?.display_name || 
              share.shared_by_user.email?.split('@')[0] || 'Unknown'
      } : null
    })) || [];

    return NextResponse.json(transformedShares);

  } catch (error) {
    console.error("Share fetch API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get("shareId");

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!shareId) {
      return NextResponse.json({ error: "shareId is required" }, { status: 400 });
    }

    // Verify user has permission to delete this share
    const { data: share, error: shareError } = await supabase
      .from("document_shares")
      .select("document_id, shared_by")
      .eq("id", shareId)
      .single();

    if (shareError || !share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    // Check if user is the one who shared it or the document owner
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("uploaded_by")
      .eq("id", share.document_id)
      .single();

    if (docError || (!document) || (share.shared_by !== user.id && document.uploaded_by !== user.id)) {
      return NextResponse.json({ error: "Insufficient permissions to remove share" }, { status: 403 });
    }

    // Delete the share
    const { error: deleteError } = await supabase
      .from("document_shares")
      .delete()
      .eq("id", shareId);

    if (deleteError) {
      console.error("Share deletion error:", deleteError);
      return NextResponse.json({ error: "Failed to remove share" }, { status: 500 });
    }

    // Check if this was the last share and update document is_shared flag
    const { data: remainingShares, error: countError } = await supabase
      .from("document_shares")
      .select("id")
      .eq("document_id", share.document_id);

    if (!countError && (!remainingShares || remainingShares.length === 0)) {
      await supabase
        .from("documents")
        .update({ is_shared: false })
        .eq("id", share.document_id);
    }

    // Log unshare activity
    await supabase
      .from("document_activity")
      .insert([{
        document_id: share.document_id,
        user_id: user.id,
        activity_type: "unshared",
        details: { share_id: shareId }
      }]);

    console.log(`🔗 Removed share: ${shareId}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Share deletion API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}