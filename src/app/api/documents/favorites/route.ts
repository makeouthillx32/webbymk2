// app/api/documents/favorites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient(); // ✅ AWAIT ADDED

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: favorites, error } = await supabase
      .from("folder_favorites")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Favorites fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
    }

    console.log(`⭐ Fetched ${favorites?.length || 0} favorites for user: ${user.id}`);
    return NextResponse.json(favorites || []);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient(); // ✅ AWAIT ADDED
    const body = await req.json();
    const { folderPath, folderName } = body;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    if (!folderPath || !folderName) {
      return NextResponse.json({ error: "folderPath and folderName are required" }, { status: 400 });
    }

    // Check if favorite already exists
    const { data: existing, error: checkError } = await supabase
      .from("folder_favorites")
      .select("id")
      .eq("user_id", user.id)
      .eq("folder_path", folderPath)
      .single();

    if (checkError && checkError.code !== "PGRST116") { // PGRST116 = no rows returned
      console.error("Check existing favorite error:", checkError);
      return NextResponse.json({ error: "Failed to check existing favorite" }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ error: "Folder is already in favorites" }, { status: 409 });
    }

    // Create new favorite
    const { data: favorite, error } = await supabase
      .from("folder_favorites")
      .insert([{
        user_id: user.id,
        folder_path: folderPath,
        folder_name: folderName
      }])
      .select("*")
      .single();

    if (error) {
      console.error("Favorite creation error:", error);
      return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
    }

    console.log(`⭐ Added favorite: ${folderName} (${folderPath})`);
    return NextResponse.json(favorite);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient(); // ✅ AWAIT ADDED
    const { searchParams } = new URL(req.url);
    const folderPath = searchParams.get("folderPath");

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!folderPath) {
      return NextResponse.json({ error: "folderPath is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("folder_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("folder_path", folderPath);

    if (error) {
      console.error("Favorite deletion error:", error);
      return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
    }

    console.log(`⭐ Removed favorite: ${folderPath}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}