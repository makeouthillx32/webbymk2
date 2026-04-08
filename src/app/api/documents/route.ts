// app/api/documents/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get("folder");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("documents")
      .select(`
        id,
        name,
        path,
        type,
        mime_type,
        size_bytes,
        uploaded_by,
        created_at,
        updated_at,
        is_favorite,
        is_shared,
        tags,
        parent_path
      `)
      .is("deleted_at", null)
      .order("type", { ascending: false }) // Folders first
      .order("name", { ascending: true })
      .limit(limit);

    // If searching, use full-text search
    if (search) {
      console.log("🔍 Searching documents for:", search);
      const {
        data: searchResults,
        error: searchError,
      } = await supabase.rpc("search_documents", {
        p_query: search,
        p_user_id: user.id,
        p_folder_path: folder || "",
        p_file_types: null,
        p_limit: limit,
      });

      if (searchError) {
        console.error("Search error:", searchError);
        query = query.ilike("name", `%${search}%`);
      } else {
        return NextResponse.json(searchResults || []);
      }
    }

    // Filter by folder if specified
    if (folder) {
      if (folder === "") {
        // Root folder - documents with no parent
        query = query.is("parent_path", null);
      } else {
        // Specific folder - direct children only
        query = query.eq("parent_path", folder);
      }
    } else {
      // Default to root folder
      query = query.is("parent_path", null);
    }

    const { data: documents, error } = await query;
    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents" },
        { status: 500 }
      );
    }

    // Transform and add fileCount for folders
    const transformed = await Promise.all(
      (documents || []).map(async (doc) => {
        let fileCount: number | undefined;

        if (doc.type === "folder") {
          const {
            count,
            error: countError,
          } = await supabase
            .from("documents")
            .select("id", { head: true, count: "exact" })
            .is("deleted_at", null)
            .eq("parent_path", doc.path);

          if (countError) {
            console.error(`Count error for folder ${doc.path}:`, countError);
            fileCount = 0;
          } else {
            fileCount = count ?? 0;
          }
        }

        return {
          id: doc.id,
          name: doc.name,
          path: doc.path,
          type: doc.type,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes || 0,
          uploaded_by: doc.uploaded_by,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          is_favorite: doc.is_favorite || false,
          is_shared: doc.is_shared || false,
          tags: doc.tags || [],
          uploader_name: "Unknown",
          uploader_email: "",
          fileCount,
        };
      })
    );

    console.log(
      `📁 Fetched ${transformed.length} documents for folder: ${
        folder || "root"
      }`
    );
    return NextResponse.json(transformed);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const {
      type,
      name,
      path,
      parentPath,
      mime_type,
      size_bytes,
      storage_path,
      tags,
    } = body;

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 }
      );
    }

    // For folders, use the create_folder_path function
    if (type === "folder") {
      const folderPath = parentPath ? `${parentPath}${name}/` : `${name}/`;

      const { data: folderId, error: folderError } = await supabase.rpc(
        "create_folder_path",
        {
          p_path: folderPath,
          p_user_id: user.id,
        }
      );

      if (folderError) {
        console.error("Folder creation error:", folderError);
        return NextResponse.json(
          { error: "Failed to create folder" },
          { status: 500 }
        );
      }

      // Fetch the created folder to return complete data
      const { data: folder, error: fetchError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", folderId)
        .single();

      if (fetchError) {
        console.error("Fetch folder error:", fetchError);
        return NextResponse.json(
          { error: "Failed to fetch created folder" },
          { status: 500 }
        );
      }

      return NextResponse.json(folder);
    }

    // For files, insert directly
    const documentData = {
      name,
      path: path || (parentPath ? `${parentPath}${name}` : name),
      parent_path: parentPath || null,
      type,
      mime_type: mime_type || null,
      size_bytes: size_bytes || 0,
      storage_path: storage_path || null,
      bucket_name: "documents",
      tags: tags || [],
      uploaded_by: user.id,
      is_favorite: false,
      is_shared: false,
      visibility: "private",
    };

    const { data: document, error } = await supabase
      .from("documents")
      .insert([documentData])
      .select("*")
      .single();

    if (error) {
      console.error("Document creation error:", error);
      return NextResponse.json(
        { error: "Failed to create document" },
        { status: 500 }
      );
    }

    // Log the activity
    await supabase.from("document_activity").insert([
      {
        document_id: document.id,
        user_id: user.id,
        activity_type: type === "folder" ? "created" : "uploaded",
      },
    ]);

    console.log(`📄 Created ${type}: ${name}`);
    return NextResponse.json(document);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}