// app/api/documents/[id]/move/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;
    const body = await req.json();
    const { newPath } = body;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    if (!newPath) {
      return NextResponse.json({ error: "newPath is required" }, { status: 400 });
    }

    // Use the move_document function from the database schema
    const { data: success, error } = await supabase
      .rpc("move_document", {
        p_document_id: id,
        p_new_path: newPath,
        p_user_id: user.id
      });

    if (error) {
      console.error("Document move error:", error);
      return NextResponse.json({ error: "Failed to move document" }, { status: 500 });
    }

    console.log(`📁 Moved document: ${id} to ${newPath}`);
    return NextResponse.json({ 
      success: true,
      message: "Document moved successfully",
      newPath 
    });

  } catch (error) {
    console.error("Move API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}