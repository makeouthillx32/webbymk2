// app/api/documents/[id]/download/route.ts - FIXED VERSION
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // FIXED: Next.js 15 params structure
) {
  try {
    // FIXED: Add await for createClient
    const supabase = await createClient();
    
    // FIXED: Await params in Next.js 15
    const { id } = await context.params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get document details
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, name, storage_path, bucket_name, mime_type, size_bytes")
      .eq("id", id)
      .eq("uploaded_by", user.id) // Ensure user owns the document
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      console.error("Document fetch error:", docError);
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Get file from Supabase Storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from(document.bucket_name || "documents")
      .download(document.storage_path);

    if (storageError || !fileData) {
      console.error("Storage download error:", storageError);
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    // Log download activity
    await supabase
      .from("document_activity")
      .insert([{
        document_id: id,
        user_id: user.id,
        activity_type: "downloaded",
        ip_address: req.headers.get("x-forwarded-for")?.split(',')[0] || 
                   req.headers.get("x-real-ip") || null,
        user_agent: req.headers.get("user-agent") || ""
      }]);

    // Convert file to buffer
    const buffer = await fileData.arrayBuffer();
    
    // Set appropriate headers
    const headers = new Headers({
      'Content-Type': document.mime_type || 'application/octet-stream',
      'Content-Length': buffer.byteLength.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.name)}"`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    return new NextResponse(buffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error("Download API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}