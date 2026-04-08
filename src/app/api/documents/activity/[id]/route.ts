// app/api/documents/activity/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this document
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, name, uploaded_by")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Fetch activity with user information
    const { data: activity, error } = await supabase
      .from("document_activity")
      .select(`
        id,
        document_id,
        user_id,
        activity_type,
        details,
        created_at,
        ip_address,
        user_agent,
        user:user_id(
          email,
          raw_user_meta_data
        )
      `)
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Activity fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
    }

    // Transform the data to match the expected format
    const transformedActivity = activity?.map(act => ({
      id: act.id,
      document_id: act.document_id,
      user_id: act.user_id,
      activity_type: act.activity_type,
      details: act.details,
      created_at: act.created_at,
      user: {
        email: act.user?.email || '',
        raw_user_meta_data: act.user?.raw_user_meta_data || {}
      }
    })) || [];

    console.log(`📊 Fetched ${transformedActivity.length} activity records for document: ${id}`);
    return NextResponse.json(transformedActivity);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { id } = params;
    const body = await req.json();
    const { activity_type, details } = body;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate required fields
    if (!activity_type) {
      return NextResponse.json({ error: "activity_type is required" }, { status: 400 });
    }

    // Verify document exists
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Get request metadata
    const userAgent = req.headers.get("user-agent") || "";
    const forwardedFor = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const ipAddress = forwardedFor?.split(',')[0] || realIp || null;

    // Create activity record
    const { data: activity, error } = await supabase
      .from("document_activity")
      .insert([{
        document_id: id,
        user_id: user.id,
        activity_type,
        details: details || null,
        ip_address: ipAddress,
        user_agent: userAgent
      }])
      .select(`
        id,
        document_id,
        user_id,
        activity_type,
        details,
        created_at,
        user:user_id(
          email,
          raw_user_meta_data
        )
      `)
      .single();

    if (error) {
      console.error("Activity creation error:", error);
      return NextResponse.json({ error: "Failed to create activity record" }, { status: 500 });
    }

    // Transform the data
    const transformedActivity = {
      id: activity.id,
      document_id: activity.document_id,
      user_id: activity.user_id,
      activity_type: activity.activity_type,
      details: activity.details,
      created_at: activity.created_at,
      user: {
        email: activity.user?.email || '',
        raw_user_meta_data: activity.user?.raw_user_meta_data || {}
      }
    };

    console.log(`📊 Created activity record: ${activity_type} for document: ${id}`);
    return NextResponse.json(transformedActivity);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}