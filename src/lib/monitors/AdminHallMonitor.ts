// lib/monitors/AdminHallMonitor.ts
import { createBrowserClient } from '@supabase/ssr';
import type {
  HallMonitor,
  AccessResult,
  ContentConfig,
  UserSpecialization,
  NavigationItem,
  AccessContext
} from '@/types/monitors';
import {
  RESOURCES,
  ACTIONS,
  FEATURES,
  ADMIN_SPECIALIZATIONS,
  HallMonitorError
} from '@/types/monitors';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class AdminHallMonitor implements HallMonitor {
  role_name = 'admin'; // ✅ FIXED: Changed from 'role' to 'role_name' to match interface

  // Core access control method
  async checkAccess(
    userId: string,
    resource: string,
    action: string,
    context?: AccessContext
  ): Promise<AccessResult> {
    try {
      console.log(`[AdminHallMonitor] Checking access for ${userId}: ${resource}:${action}`);

      // First verify user is admin
      const userSpecializations = await this.getSpecializations(userId);
      if (userSpecializations.length === 0) {
        return {
          hasAccess: false,
          reason: 'User has no admin specializations'
        };
      }

      // Get user's admin specialization names
      const specializationNames = userSpecializations.map(s => s.name);
      console.log(`[AdminHallMonitor] User specializations:`, specializationNames);

      // Check access based on resource and action
      const accessResult = this.checkSpecializationAccess(
        resource,
        action,
        specializationNames,
        context
      );

      console.log(`[AdminHallMonitor] Access result:`, accessResult);
      return accessResult;

    } catch (error) {
      console.error('[AdminHallMonitor] Access check error:', error);
      return {
        hasAccess: false,
        reason: 'Access check failed due to error',
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Check access based on admin specializations
  private checkSpecializationAccess(
    resource: string,
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    switch (resource) {
      case RESOURCES.USERS:
        return this.checkUserManagementAccess(action, specializations, context);
      
      case RESOURCES.CONTENT:
        return this.checkContentManagementAccess(action, specializations, context);
      
      case RESOURCES.SYSTEM:
        return this.checkSystemAccess(action, specializations, context);
      
      case RESOURCES.SPECIALIZATIONS:
        return this.checkSpecializationManagementAccess(action, specializations, context);
      
      case RESOURCES.ANALYTICS:
        return this.checkAnalyticsAccess(action, specializations, context);
      
      case RESOURCES.DASHBOARD:
        return this.checkDashboardAccess(action, specializations, context);
      
      default:
        // For unknown resources, allow if user has any admin specialization
        return {
          hasAccess: specializations.length > 0,
          reason: specializations.length > 0 
            ? 'Admin with specialization can access general resources' 
            : 'No admin specializations found'
        };
    }
  }

  // User management access (User Manager + System Admin)
  private checkUserManagementAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const allowedSpecs = [
      ADMIN_SPECIALIZATIONS.USER_MANAGER,
      ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN
    ];

    const hasRequiredSpec = specializations.some(spec => allowedSpecs.includes(spec as any));

    if (!hasRequiredSpec) {
      return {
        hasAccess: false,
        reason: 'Requires User Manager or System Admin specialization'
      };
    }

    // All user management actions allowed for these specializations
    switch (action) {
      case ACTIONS.CREATE:
      case ACTIONS.READ:
      case ACTIONS.UPDATE:
      case ACTIONS.DELETE:
      case ACTIONS.ASSIGN:
        return {
          hasAccess: true,
          reason: `Admin with ${specializations.join(', ')} can ${action} users`
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown user management action: ${action}`
        };
    }
  }

  // Content management access (Content Manager only)
  private checkContentManagementAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const hasContentManager = specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER);

    if (!hasContentManager) {
      return {
        hasAccess: false,
        reason: 'Requires Content Manager specialization'
      };
    }

    // Content Manager can do all content actions
    switch (action) {
      case ACTIONS.CREATE:
      case ACTIONS.READ:
      case ACTIONS.UPDATE:
      case ACTIONS.DELETE:
      case ACTIONS.PUBLISH:
        return {
          hasAccess: true,
          reason: `Content Manager can ${action} content`
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown content action: ${action}`
        };
    }
  }

  // System access (System Admin only)
  private checkSystemAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const hasSystemAdmin = specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN);

    if (!hasSystemAdmin) {
      return {
        hasAccess: false,
        reason: 'Requires System Admin specialization'
      };
    }

    // System Admin can do all system actions
    return {
      hasAccess: true,
      reason: `System Admin can perform ${action} on system`
    };
  }

  // Specialization management access (User Manager + System Admin)
  private checkSpecializationManagementAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const allowedSpecs = [
      ADMIN_SPECIALIZATIONS.USER_MANAGER,
      ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN
    ];

    const hasRequiredSpec = specializations.some(spec => allowedSpecs.includes(spec as any));

    return {
      hasAccess: hasRequiredSpec,
      reason: hasRequiredSpec 
        ? `Admin can ${action} specializations`
        : 'Requires User Manager or System Admin specialization'
    };
  }

  // Analytics access (all admin specializations can read)
  private checkAnalyticsAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    if (action === ACTIONS.READ) {
      return {
        hasAccess: specializations.length > 0,
        reason: 'All admin specializations can read analytics'
      };
    }

    // Only System Admin can modify analytics settings
    const hasSystemAdmin = specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN);
    return {
      hasAccess: hasSystemAdmin,
      reason: hasSystemAdmin 
        ? `System Admin can ${action} analytics`
        : 'Only System Admin can modify analytics'
    };
  }

  // Dashboard access (all admin specializations)
  private checkDashboardAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    return {
      hasAccess: specializations.length > 0,
      reason: specializations.length > 0 
        ? 'Admin can access dashboard'
        : 'No admin specializations found'
    };
  }

  // Get content configuration for admin user
  async getContentConfig(userId: string): Promise<ContentConfig> {
    try {
      const specializations = await this.getSpecializations(userId);
      const specializationNames = specializations.map(s => s.name);

      // Determine dashboard layout based on primary specialization
      let dashboardLayout: ContentConfig['dashboardLayout'] = 'admin-system';
      if (specializationNames.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
        dashboardLayout = 'admin-content';
      } else if (specializationNames.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
        dashboardLayout = 'admin-users';
      }

      // Build available features based on specializations
      const availableFeatures = this.buildAvailableFeatures(specializationNames);
      
      // Build navigation items
      const navigationItems = await this.buildNavigationItems(userId, specializationNames);

      // Build permissions
      const permissions = await this.getPermissions(userId);

      return {
        dashboardLayout,
        availableFeatures,
        primaryActions: this.getPrimaryActions(specializationNames),
        secondaryActions: this.getSecondaryActions(specializationNames),
        navigationItems,
        hiddenSections: this.getHiddenSections(specializationNames),
        customFields: this.getCustomFields(specializationNames),
        visibleComponents: this.getVisibleComponents(specializationNames),
        permissions
      };
    } catch (error) {
      console.error('[AdminHallMonitor] Error getting content config:', error);
      throw new HallMonitorError(
        'Failed to get admin content configuration',
        'CONFIG_ERROR',
        { userId, error }
      );
    }
  }

  // Build available features based on specializations
  private buildAvailableFeatures(specializations: string[]): string[] {
    const features: string[] = [
      FEATURES.MESSAGING,
      FEATURES.NOTIFICATIONS,
      FEATURES.PROFILE_VIEW,
      FEATURES.ANALYTICS_DASHBOARD
    ];

    if (specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      features.push(
        FEATURES.CONTENT_EDITOR,
        FEATURES.USER_MANAGEMENT // Content managers often need to see user content
      );
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      features.push(
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLE_ASSIGNMENT
      );
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      features.push(
        FEATURES.SYSTEM_SETTINGS,
        FEATURES.USER_MANAGEMENT,
        FEATURES.ROLE_ASSIGNMENT
      );
    }

    return features;
  }

  // Build navigation items for admin
  private async buildNavigationItems(userId: string, specializations: string[]): Promise<NavigationItem[]> {
    const navItems: NavigationItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard/admin',
        icon: 'LayoutDashboard'
      },
      {
        id: 'analytics',
        label: 'Analytics',
        href: '/dashboard/admin/analytics',
        icon: 'BarChart3'
      }
    ];

    // Content Manager navigation
    if (specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      navItems.push({
        id: 'content',
        label: 'Content',
        href: '/dashboard/admin/content',
        icon: 'FileText',
        children: [
          {
            id: 'content-editor',
            label: 'Editor',
            href: '/dashboard/admin/content/editor',
            icon: 'Edit'
          },
          {
            id: 'content-library',
            label: 'Library',
            href: '/dashboard/admin/content/library',
            icon: 'Library'
          }
        ]
      });
    }

    // User Manager navigation
    if (specializations.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      navItems.push({
        id: 'users',
        label: 'Users',
        href: '/dashboard/admin/users',
        icon: 'Users',
        children: [
          {
            id: 'user-list',
            label: 'All Users',
            href: '/dashboard/admin/users',
            icon: 'List'
          },
          {
            id: 'roles',
            label: 'Roles & Specializations',
            href: '/dashboard/admin/roles',
            icon: 'Shield'
          },
          {
            id: 'invites',
            label: 'Invites',
            href: '/dashboard/admin/invites',
            icon: 'UserPlus'
          }
        ]
      });
    }

    // System Admin navigation
    if (specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      navItems.push({
        id: 'system',
        label: 'System',
        href: '/dashboard/admin/system',
        icon: 'Settings',
        children: [
          {
            id: 'settings',
            label: 'Settings',
            href: '/dashboard/admin/system/settings',
            icon: 'Cog'
          },
          {
            id: 'logs',
            label: 'Logs',
            href: '/dashboard/admin/system/logs',
            icon: 'FileText'
          },
          {
            id: 'backup',
            label: 'Backup',
            href: '/dashboard/admin/system/backup',
            icon: 'Download'
          }
        ]
      });
    }

    return navItems;
  }

  // Get primary actions based on specializations
  private getPrimaryActions(specializations: string[]): string[] {
    const actions: string[] = [];

    if (specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      actions.push('create-content', 'publish-content');
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      actions.push('create-user', 'assign-role');
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      actions.push('system-settings', 'backup-data');
    }

    return actions;
  }

  // Get secondary actions
  private getSecondaryActions(specializations: string[]): string[] {
    return ['view-analytics', 'export-data', 'send-notification'];
  }

  // Get hidden sections
  private getHiddenSections(specializations: string[]): string[] {
    const hidden: string[] = [];

    // Hide content sections if not Content Manager
    if (!specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      hidden.push('content-editor', 'content-library');
    }

    // Hide user management if not User Manager or System Admin
    if (!specializations.some(s => [
      ADMIN_SPECIALIZATIONS.USER_MANAGER,
      ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN
    ].includes(s as any))) {
      hidden.push('user-management', 'role-assignment');
    }

    // Hide system settings if not System Admin
    if (!specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      hidden.push('system-settings', 'system-logs', 'backup-restore');
    }

    return hidden;
  }

  // Get custom fields based on specializations
  private getCustomFields(specializations: string[]): Record<string, any> {
    const fields: Record<string, any> = {};

    if (specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      fields.contentEditor = {
        showAdvanced: true,
        allowHTML: true,
        enableTemplates: true
      };
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      fields.userManagement = {
        showBulkActions: true,
        allowRoleChange: true,
        showUserAnalytics: true
      };
    }

    return fields;
  }

  // Get visible components
  private getVisibleComponents(specializations: string[]): string[] {
    const components = ['admin-dashboard', 'analytics-widget'];

    if (specializations.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      components.push('content-editor', 'content-analytics');
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      components.push('user-table', 'role-manager', 'invite-system');
    }

    if (specializations.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      components.push('system-monitor', 'backup-panel', 'log-viewer');
    }

    return components;
  }

  // Get user specializations (admin role only)
  async getSpecializations(userId: string): Promise<UserSpecialization[]> {
    try {
      const { data, error } = await supabase.rpc('get_user_specializations', {
        user_uuid: userId
      });

      if (error) {
        console.error('[AdminHallMonitor] Error fetching specializations:', error);
        return [];
      }

      // Filter to only admin role specializations
      const adminSpecializations = (data || []).filter((spec: any) => 
        spec.role_name === 'admin'
      );

      console.log(`[AdminHallMonitor] Found ${adminSpecializations.length} admin specializations for user ${userId}`);
      return adminSpecializations;
    } catch (error) {
      console.error('[AdminHallMonitor] Specializations fetch error:', error);
      return [];
    }
  }

  // Check if user has specific specialization
  async hasSpecialization(userId: string, specializationName: string): Promise<boolean> {
    const specializations = await this.getSpecializations(userId);
    return specializations.some(spec => spec.name === specializationName);
  }

  // Get permissions for admin user
  async getPermissions(userId: string): Promise<string[]> {
    const specializations = await this.getSpecializations(userId);
    const specializationNames = specializations.map(s => s.name);
    
    const permissions: string[] = [
      'dashboard:read',
      'analytics:read',
      'profile:read',
      'profile:update',
      'notifications:read'
    ];

    // Add specialization-specific permissions
    if (specializationNames.includes(ADMIN_SPECIALIZATIONS.CONTENT_MANAGER)) {
      permissions.push(
        'content:create',
        'content:read',
        'content:update',
        'content:delete',
        'content:publish'
      );
    }

    if (specializationNames.includes(ADMIN_SPECIALIZATIONS.USER_MANAGER)) {
      permissions.push(
        'users:create',
        'users:read',
        'users:update',
        'users:delete',
        'users:assign_roles',
        'specializations:manage'
      );
    }

    if (specializationNames.includes(ADMIN_SPECIALIZATIONS.SYSTEM_ADMIN)) {
      permissions.push(
        'system:settings',
        'system:backup',
        'system:logs',
        'system:maintenance',
        'users:all', // System admin gets all user permissions
        'analytics:admin'
      );
    }

    return permissions;
  }

  // Check if user can access a specific feature
  async canAccessFeature(userId: string, feature: string): Promise<boolean> {
    const config = await this.getContentConfig(userId);
    return config.availableFeatures.includes(feature);
  }

  // Get navigation items for user
  async getNavigationItems(userId: string): Promise<NavigationItem[]> {
    const specializations = await this.getSpecializations(userId);
    const specializationNames = specializations.map(s => s.name);
    return this.buildNavigationItems(userId, specializationNames);
  }
}