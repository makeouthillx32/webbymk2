// utils/supabase/index.ts
/**
 * Supabase client utilities - central export point
 * 
 * This file serves as the central export point for all Supabase-related
 * client utilities. Use the appropriate client based on your context:
 * 
 * - Server-side operations: import { createClient } from "@/utils/supabase/server"
 * - Browser operations: import { createClient } from "@/utils/supabase/client"
 * - Direct client (use sparingly): import supabase from "@/utils/supabase/supabaseClient"
 */

// Export for convenience
export { createClient as createServerClient } from "./server";
export { createClient as createBrowserClient } from "./client";
export { default as supabaseClient } from "@/lib/supabaseClient";

// Export type
export type { Database } from "@/types/supabase";