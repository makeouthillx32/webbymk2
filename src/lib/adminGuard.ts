// lib/adminGuard.ts
/**
 * Admin Route Protection
 * Hard locks admin routes - only admins can access
 */

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { authLogger } from "./authLogger";

export async function requireAdmin() {
  const supabase = await createClient();
  
  // Use getUser() — Supabase recommends this over getSession() in server
  // components because it re-validates the JWT against the auth server instead
  // of just reading the (potentially stale) cookie value.
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    authLogger.securityEvent('Admin access attempt without session');
    redirect('/sign-in?error=auth_required&message=Please sign in to continue');
  }

  // Get user profile to check role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    authLogger.authError('Failed to fetch user profile', {
      userId: user.id,
      error: profileError?.message
    });
    redirect('/sign-in?error=profile_error&message=Could not verify permissions');
  }

  // Check if user is admin
  if (profile.role !== 'admin') {
    authLogger.adminAccessDenied(
      user.id,
      user.email || '',
      'admin dashboard'
    );

    redirect('/?error=access_denied&message=You do not have permission to access this area');
  }

  // Access granted
  authLogger.adminSignIn(user.id, user.email || '');

  return {
    user,
    profile
  };
}

// Client-side admin check hook
export function useAdminGuard() {
  // This should be used in client components
  // Returns whether user is admin
  return {
    isAdmin: false, // Will be hydrated from server
    isLoading: true
  };
}