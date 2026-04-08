// app/api/documents/[id]/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get document information
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select(`
        id,
        name,
        type,
        mime_type,
        size_bytes,
        storage_path,
        bucket_name,
        uploaded_by
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Don't allow previewing folders
    if (document.type === "folder") {
      return NextResponse.json({ error: "Cannot preview folders" }, { status: 400 });
    }

    // Check if file exists in storage
    if (!document.storage_path) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404 });
    }

    // Check if file type is previewable
    const previewableMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/json',
      'text/markdown',
      'text/csv'
    ];

    const mimeType = document.mime_type?.toLowerCase();
    if (!mimeType || !previewableMimeTypes.includes(mimeType)) {
      return NextResponse.json({ 
        error: "File type not supported for preview",
        supportedTypes: previewableMimeTypes 
      }, { status: 400 });
    }

    // Get the file from Supabase Storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from(document.bucket_name || "documents")
      .download(document.storage_path);

    if (storageError || !fileData) {
      console.error("Storage preview error:", storageError);
      return NextResponse.json({ error: "Failed to load file for preview" }, { status: 500 });
    }

    // Log preview activity
    await supabase
      .from("document_activity")
      .insert([{
        document_id: id,
        user_id: user.id,
        activity_type: "viewed",
        details: { action: "preview" },
        ip_address: req.headers.get("x-forwarded-for")?.split(',')[0] || 
                   req.headers.get("x-real-ip") || null,
        user_agent: req.headers.get("user-agent") || ""
      }]);

    // Convert Blob to ArrayBuffer
    const arrayBuffer = await fileData.arrayBuffer();

    // Set appropriate headers for preview (inline instead of attachment)
    const headers = new Headers();
    headers.set("Content-Type", document.mime_type || "application/octet-stream");
    headers.set("Content-Length", document.size_bytes?.toString() || "0");
    headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(document.name)}"`);
    headers.set("Cache-Control", "private, max-age=300"); // 5 minute cache for previews
    
    // Security headers for content
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    
    // For text files, ensure UTF-8 encoding
    if (mimeType?.startsWith('text/') || mimeType?.includes('json') || mimeType?.includes('javascript')) {
      headers.set("Content-Type", `${document.mime_type}; charset=utf-8`);
    }

    console.log(`👁️ Previewed file: ${document.name} (${document.mime_type})`);
    
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error("Preview API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Get preview metadata without downloading the full file
export async function HEAD(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new NextResponse(null, { status: 401 });
    }

    // Get document information
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select(`
        id,
        name,
        type,
        mime_type,
        size_bytes,
        storage_path,
        bucket_name
      `)
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      return new NextResponse(null, { status: 404 });
    }

    if (document.type === "folder" || !document.storage_path) {
      return new NextResponse(null, { status: 400 });
    }

    // Check if file is previewable
    const previewableMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf', 'text/plain', 'text/html', 'text/css', 'text/javascript',
      'application/json', 'text/markdown', 'text/csv'
    ];

    const isPreviewable = document.mime_type && 
      previewableMimeTypes.includes(document.mime_type.toLowerCase());

    const headers = new Headers();
    headers.set("Content-Type", document.mime_type || "application/octet-stream");
    headers.set("Content-Length", document.size_bytes?.toString() || "0");
    headers.set("X-Preview-Supported", isPreviewable ? "true" : "false");
    headers.set("X-File-Name", encodeURIComponent(document.name));
    headers.set("X-File-Type", document.type);

    return new NextResponse(null, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error("Preview HEAD API Error:", error);
    return new NextResponse(null, { status: 500 });
  }
}