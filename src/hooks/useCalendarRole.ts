// hooks/useCalendarRole.ts - Extract role management logic
import { useState, useEffect, useMemo } from 'react';
import { userRoleCookies } from '@/lib/cookieUtils';

interface User {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    display_name?: string;
    department?: string;
    specialization?: string;
  };
  app_metadata?: {
    role?: string;
  };
}

export function useCalendarRole(user: User | null) {
  const [userRole, setUserRole] = useState<string>(
    userRoleCookies.getUserRole(user?.id) || 'user0x'
  );
  const [roleLoading, setRoleLoading] = useState(true);

  // Fetch user role with cookie optimization
  useEffect(() => {
    async function fetchUserRole() {
      if (!user?.id) {
        setRoleLoading(false);
        return;
      }

      try {
        // Use smart cookie fallback
        const role = await userRoleCookies.getRoleWithFallback(
          user.id,
          `/api/profile/${user.id}`
        );
        setUserRole(role);
      } catch (error) {
        console.error('Error fetching user role:', error);
        const fallbackRole = user?.user_metadata?.role || user?.app_metadata?.role || 'user0x';
        setUserRole(fallbackRole);
      } finally {
        setRoleLoading(false);
      }
    }

    fetchUserRole();
  }, [user?.id]);

  // Calculate if user is admin
  const isAdmin = userRole === 'admin1';

  // Fallback permissions based on role
  const fallbackPermissions = useMemo(() => {
    switch (userRole) {
      case 'admin1':
        return {
          canCreateEvents: true,
          canEditEvents: true,
          canDeleteEvents: true,
          canLogHours: true,
          canViewAllEvents: true,
          canManageUsers: true,
          canExportData: true
        };
      case 'coachx7':
        return {
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: true,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: true
        };
      case 'client7x':
        return {
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: false,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: true
        };
      default:
        return {
          canCreateEvents: false,
          canEditEvents: false,
          canDeleteEvents: false,
          canLogHours: false,
          canViewAllEvents: false,
          canManageUsers: false,
          canExportData: false
        };
    }
  }, [userRole]);

  return {
    userRole,
    setUserRole,
    roleLoading,
    isAdmin,
    fallbackPermissions
  };
}