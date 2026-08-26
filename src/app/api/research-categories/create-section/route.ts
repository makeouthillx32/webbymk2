// src/app/api/research-categories/create-section/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/research-categories/create-section
//
// Called by the TUI after scaffolding a new zone to seed starter categories
// for that zone's section. Idempotent — safe to call multiple times.
//
// Body:  { section: string }   e.g. { section: "blog" }
// Returns: { created: boolean, count: number }
//
// Does NOT touch the zones table. Only public.categories.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

const SECTION_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const section: unknown = body?.section;

    // ── Validate ────────────────────────────────────────────────────────────
    if (typeof section !== "string" || !section.trim()) {
      return NextResponse.json(
        { error: "section is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    const normalised = section.trim().toLowerCase();

    if (!SECTION_RE.test(normalised)) {
      return NextResponse.json(
        { error: "section must contain only lowercase letters, numbers, and hyphens." },
        { status: 400 }
      );
    }

    if (normalised === "shop") {
      return NextResponse.json(
        { error: "Cannot create 'shop' — it is a reserved section." },
        { status: 400 }
      );
    }

    // ── Auth guard ──────────────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // ── Call the Postgres function ──────────────────────────────────────────
    const { data, error } = await supabase.rpc("create_category_section", {
      p_section: normalised,
    });

    if (error) {
      console.error("[create-section] rpc error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const count = typeof data === "number" ? data : 0;

    return NextResponse.json({
      created: count > 0,
      count,
      section: normalised,
    });
  } catch (err) {
    console.error("[create-section] unexpected:", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
