// hooks/useCalendarPermissions.ts - Updated to use new role_permissions table
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface CalendarPermissions {
  canCreateEvents: boolean;
  canEditEvents: boolean;
  canDeleteEvents: boolean;
  canLogHours: boolean;
  canViewAllEvents: boolean;
  canManageUsers: boolean;
  canExportData: boolean;
  canCreateSLS: boolean;
  canManageCalendar: boolean;
}

interface RolePermissionRecord {
  permission_name: string;
  is_granted: boolean;
  resource_type: string;
}

export function useCalendarPermissions(userId: string | null, userRole: string | null) {
  const [permissions, setPermissions] = useState<CalendarPermissions>({
    canCreateEvents: false,
    canEditEvents: false,
    canDeleteEvents: false,
    canLogHours: false,
    canViewAllEvents: false,
    canManageUsers: false,
    canExportData: false,
    canCreateSLS: false,
    canManageCalendar: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch permissions from new role_permissions table
  const fetchRolePermissions = async () => {
    if (!userRole) {
      console.log('[RolePermissions] No user role provided');
      setPermissions({
        canCreateEvents: false,
        canEditEvents: false,
        canDeleteEvents: false,
        canLogHours: false,
        canViewAllEvents: false,
        canManageUsers: false,
        canExportData: false,
        canCreateSLS: false,
        canManageCalendar: false,
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[RolePermissions] Fetching permissions for role:', userRole);

      // Call the new role permissions function
      const { data: rolePermissions, error: permError } = await supabase
        .rpc('get_role_permissions', {
          user_role_type: userRole
        });

      if (permError) {
        console.error('[RolePermissions] Error fetching role permissions:', permError);
        throw new Error(`Failed to fetch role permissions: ${permError.message}`);
      }

      console.log('[RolePermissions] Fetched role permissions:', rolePermissions);
      parseRolePermissions(rolePermissions || []);

    } catch (err) {
      console.error('[RolePermissions] Error in fetchRolePermissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch role permissions');
      
      // Fallback to hardcoded permissions based on role
      setFallbackPermissions(userRole);
    } finally {
      setLoading(false);
    }
  };

  // Parse role permission records into boolean flags
  const parseRolePermissions = (permissionRecords: RolePermissionRecord[]) => {
    const newPermissions: CalendarPermissions = {
      canCreateEvents: false,
      canEditEvents: false,
      canDeleteEvents: false,
      canLogHours: false,
      canViewAllEvents: false,
      canManageUsers: false,
      canExportData: false,
      canCreateSLS: false,
      canManageCalendar: false,
    };

    // Map database permissions to our interface
    permissionRecords.forEach(perm => {
      switch (perm.permission_name) {
        case 'create_events':
          newPermissions.canCreateEvents = perm.is_granted;
          break;
        case 'edit_events':
          newPermissions.canEditEvents = perm.is_granted;
          break;
        case 'delete_events':
          newPermissions.canDeleteEvents = perm.is_granted;
          break;
        case 'log_hours':
          newPermissions.canLogHours = perm.is_granted;
          break;
        case 'view_all_events':
          newPermissions.canViewAllEvents = perm.is_granted;
          break;
        case 'manage_users':
          newPermissions.canManageUsers = perm.is_granted;
          break;
        case 'export_data':
          newPermissions.canExportData = perm.is_granted;
          break;
        case 'sls_create':
          newPermissions.canCreateSLS = perm.is_granted;
          break;
        case 'manage_calendar':
          newPermissions.canManageCalendar = perm.is_granted;
          break;
      }
    });

    console.log('[RolePermissions] Parsed permissions:', newPermissions);
    setPermissions(newPermissions);
  };

  // Fallback to hardcoded permissions if database fails
  const setFallbackPermissions = (role: string) => {
    console.log('[RolePermissions] Using fallback permissions for role:', role);
    
    switch (role) {
      case 'admin1':
        setPermissions({
          canCreateEvents: true,
          canEditEvents: true,
          canDeleteEvents: true,
          canLogHours: true,
          canViewAllEvents: true,
          canManageUsers: true,
          canExportData: true,
          canCreateSLS: true,
          canManageCalendar: true,
        });
        break;
        
      case 'coachx7':
        setPermissions({
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: true,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: true,
          canCreateSLS: false,
          canManageCalendar: false,
        });
        break;
        
      case 'client7x':
        setPermissions({
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: false,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: true, // ✅ Clients can export
          canCreateSLS: false,
          canManageCalendar: false,
        });
        break;
        
      default:
        setPermissions({
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: false,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: false,
          canCreateSLS: false,
          canManageCalendar: false,
        });
        break;
    }
  };

  // Fetch permissions when role changes
  useEffect(() => {
    fetchRolePermissions();
  }, [userRole]);

  // Helper function to check specific permission
  const hasPermission = (permission: keyof CalendarPermissions): boolean => {
    return permissions[permission];
  };

  // Helper function to check multiple permissions (requires all)
  const hasAllPermissions = (...permissionKeys: (keyof CalendarPermissions)[]): boolean => {
    return permissionKeys.every(key => permissions[key]);
  };

  // Helper function to check multiple permissions (requires any)
  const hasAnyPermission = (...permissionKeys: (keyof CalendarPermissions)[]): boolean => {
    return permissionKeys.some(key => permissions[key]);
  };

  return {
    permissions,
    loading,
    error,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    refetch: fetchRolePermissions
  };
}