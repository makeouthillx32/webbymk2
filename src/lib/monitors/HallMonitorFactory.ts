// lib/monitors/HallMonitorFactory.ts - REFACTORED TO USE YOUR EXISTING APIS
import type { 
  MonitorUser, 
  HallMonitor, 
  ContentConfig, 
  AccessContext, 
  AccessResult,
  UserSpecialization 
} from '@/types/monitors';

// Role mapping (keep consistent with your useUserRole hook)
const ROLE_MAP: Record<string, string> = {
  'admin1': 'admin',
  'coachx7': 'jobcoach', 
  'user0x': 'user',
  'client7x': 'client'
};

// ✅ BASE MONITOR CLASS - Provides fallback functionality
class BaseMonitor implements HallMonitor {
  constructor(public role_name: string) {}

  async checkAccess(
    userId: string, 
    resource: string, 
    action: string, 
    context?: AccessContext
  ): Promise<AccessResult> {
    // Default deny-all for unknown roles
    return {
      hasAccess: false,
      reason: `Access denied for role: ${this.role_name}`,
      context
    };
  }

  async getContentConfig(userId: string): Promise<ContentConfig> {
    return {
      dashboardLayout: 'user-basic' as any,
      availableFeatures: ['profile-view'],
      primaryActions: [],
      secondaryActions: [],
      navigationItems: [
        { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'home' },
        { id: 'profile', label: 'Profile', path: '/profile', icon: 'user' }
      ],
      hiddenSections: [],
      customFields: {},
      visibleComponents: ['header', 'sidebar', 'main-content'],
      permissions: ['profile:read_own']
    };
  }
}

// ✅ ADMIN MONITOR
class AdminMonitor extends BaseMonitor {
  constructor() {
    super('admin');
  }

  async getContentConfig(userId: string): Promise<ContentConfig> {
    return {
      dashboardLayout: 'admin-content' as any,
      availableFeatures: ['user-management', 'content-editor', 'system-settings'],
      primaryActions: ['create-user', 'manage-roles', 'system-config'],
      secondaryActions: ['export-data', 'view-logs'],
      navigationItems: [
        { id: 'dashboard', label: 'Admin Dashboard', path: '/dashboard', icon: 'home' },
        { id: 'users', label: 'User Management', path: '/admin/users', icon: 'users' },
        { id: 'settings', label: 'System Settings', path: '/admin/settings', icon: 'settings' }
      ],
      hiddenSections: [],
      customFields: {},
      visibleComponents: ['header', 'sidebar', 'main-content', 'admin-panel'],
      permissions: ['admin:*']
    };
  }
}

// ✅ JOBCOACH MONITOR
class JobCoachMonitor extends BaseMonitor {
  constructor() {
    super('jobcoach');
  }

  async getContentConfig(userId: string): Promise<ContentConfig> {
    return {
      dashboardLayout: 'jobcoach-counselor' as any,
      availableFeatures: ['client-profiles', 'session-scheduler', 'progress-tracking'],
      primaryActions: ['schedule-session', 'update-client-progress'],
      secondaryActions: ['send-message', 'generate-report'],
      navigationItems: [
        { id: 'dashboard', label: 'Coach Dashboard', path: '/dashboard', icon: 'home' },
        { id: 'clients', label: 'My Clients', path: '/coach/clients', icon: 'users' },
        { id: 'calendar', label: 'Schedule', path: '/coach/calendar', icon: 'calendar' }
      ],
      hiddenSections: [],
      customFields: {},
      visibleComponents: ['header', 'sidebar', 'main-content', 'coach-tools'],
      permissions: ['coach:*', 'client:read', 'session:*']
    };
  }
}

// ✅ CLIENT MONITOR
class ClientMonitor extends BaseMonitor {
  constructor() {
    super('client');
  }

  async checkAccess(
    userId: string, 
    resource: string, 
    action: string, 
    context?: AccessContext
  ): Promise<AccessResult> {
    // Client permissions
    const clientPermissions = {
      'profile': ['read_own', 'update_own'],
      'calendar_events': ['read_own'],
      'appointments': ['read_own', 'create_own'],
      'messages': ['read_own', 'create_own']
    };

    const resourcePermissions = clientPermissions[resource as keyof typeof clientPermissions] || [];
    const hasAccess = resourcePermissions.includes(action) || resourcePermissions.includes('*');

    return {
      hasAccess,
      reason: hasAccess ? 'Access granted' : `Action '${action}' not allowed on '${resource}' for clients`,
      context
    };
  }

  async getContentConfig(userId: string): Promise<ContentConfig> {
    return {
      dashboardLayout: 'client-seeker' as any,
      availableFeatures: ['profile-editor', 'job-applications', 'skill-assessments'],
      primaryActions: ['update-profile', 'apply-to-job', 'book-session'],
      secondaryActions: ['message-coach', 'view-progress'],
      navigationItems: [
        { id: 'dashboard', label: 'My Dashboard', path: '/dashboard', icon: 'home' },
        { id: 'profile', label: 'My Profile', path: '/client/profile', icon: 'user' },
        { id: 'jobs', label: 'Job Search', path: '/client/jobs', icon: 'briefcase' },
        { id: 'sessions', label: 'My Sessions', path: '/client/sessions', icon: 'calendar' }
      ],
      hiddenSections: [],
      customFields: {},
      visibleComponents: ['header', 'sidebar', 'main-content', 'client-tools'],
      permissions: ['profile:read_own', 'profile:update_own', 'session:read_own']
    };
  }
}

// ✅ API CLIENT - Uses your existing APIs instead of direct database calls
class APIClient {
  private static baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // ✅ Use your existing /api/profile/{userId} endpoint
  static async getUserProfile(userId: string): Promise<{
    id: string;
    role: string;
    display_name?: string;
    avatar_url?: string;
    initials?: string;
  } | null> {
    try {
      console.log(`[APIClient] 🔍 Fetching profile via /api/profile/${userId}`);
      
      const response = await fetch(`${this.baseUrl}/api/profile/${userId}`);
      
      if (!response.ok) {
        console.warn(`[APIClient] ⚠️ Profile API returned: ${response.status}`);
        return null;
      }
      
      const profile = await response.json();
      console.log(`[APIClient] ✅ Profile fetched via API:`, profile);
      return profile;
      
    } catch (error) {
      console.error(`[APIClient] ❌ Error fetching profile:`, error);
      return null;
    }
  }

  // ✅ Use your existing /api/get-all-users endpoint to get email
  static async getUserEmail(userId: string): Promise<string> {
    try {
      console.log(`[APIClient] 📧 Fetching email via /api/get-all-users`);
      
      const response = await fetch(`${this.baseUrl}/api/get-all-users`);
      
      if (!response.ok) {
        console.warn(`[APIClient] ⚠️ Users API returned: ${response.status}`);
        return 'unknown@example.com';
      }
      
      const users = await response.json();
      const user = users.find((u: any) => u.id === userId);
      
      if (user?.email) {
        console.log(`[APIClient] ✅ Email found via API: ${user.email}`);
        return user.email;
      }
      
      return 'unknown@example.com';
      
    } catch (error) {
      console.warn(`[APIClient] ⚠️ Error fetching email:`, error);
      return 'unknown@example.com';
    }
  }

  // ✅ Use your existing specializations API
  static async getUserSpecializations(userId: string): Promise<UserSpecialization[]> {
    try {
      console.log(`[APIClient] 🎨 Fetching specializations via API`);
      
      const response = await fetch(
        `${this.baseUrl}/api/profile/specializations/get-user-specializations?userId=${userId}`
      );
      
      if (!response.ok) {
        console.warn(`[APIClient] ⚠️ Specializations API returned: ${response.status}`);
        return [];
      }
      
      const specializations = await response.json();
      
      // Transform to match your UserSpecialization interface
      const transformedSpecs: UserSpecialization[] = specializations.map((spec: any) => ({
        id: spec.id,
        name: spec.name,
        description: spec.description || '',
        role_id: spec.role || 'user0x',
        role_name: ROLE_MAP[spec.role] || 'user',
        assigned_at: new Date().toISOString(),
        assigned_by: undefined
      }));
      
      console.log(`[APIClient] ✅ Found ${transformedSpecs.length} specializations via API`);
      return transformedSpecs;
      
    } catch (error) {
      console.warn(`[APIClient] ⚠️ Error fetching specializations:`, error);
      return [];
    }
  }
}

// ✅ HALL MONITOR FACTORY - NOW USES YOUR EXISTING APIS
export class HallMonitorFactory {
  private static instance: HallMonitorFactory;
  private userCache = new Map<string, { user: MonitorUser; monitor: HallMonitor; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): HallMonitorFactory {
    if (!HallMonitorFactory.instance) {
      HallMonitorFactory.instance = new HallMonitorFactory();
    }
    return HallMonitorFactory.instance;
  }

  // ✅ MAIN METHOD - Now uses your existing APIs
  async getMonitorForUser(userId: string): Promise<{ user: MonitorUser; monitor: HallMonitor }> {
    try {
      console.log(`[HallMonitorFactory] 🚀 Starting getMonitorForUser for: ${userId}`);

      // Check cache first
      const cached = this.userCache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`[HallMonitorFactory] 💾 Using cached data for user: ${userId}`);
        return { user: cached.user, monitor: cached.monitor };
      }

      // ✅ Build user data using your existing APIs
      console.log(`[HallMonitorFactory] 👤 Building user data via your APIs for: ${userId}`);
      const user = await this.buildUserDataFromYourAPIs(userId);
      
      if (!user) {
        throw new Error(`Failed to build user data for: ${userId}`);
      }

      console.log(`[HallMonitorFactory] ✅ User data built for role: ${user.role_name}`);

      // Get monitor for role
      console.log(`[HallMonitorFactory] 🎭 Getting monitor for role: ${user.role_name}`);
      const monitor = this.getMonitorForRole(user.role_name);

      console.log(`[HallMonitorFactory] ✅ Monitor created for role: ${user.role_name}`);

      // Cache the result
      this.userCache.set(userId, {
        user,
        monitor,
        timestamp: Date.now()
      });

      console.log(`[HallMonitorFactory] 🎉 Successfully completed getMonitorForUser for: ${userId}`);

      return { user, monitor };

    } catch (error) {
      console.error(`[HallMonitorFactory] ❌ Error in getMonitorForUser:`, error);
      
      // Return fallback user and monitor instead of throwing
      const fallbackUser: MonitorUser = {
        id: userId,
        role_id: 'user0x',
        role_name: 'user',
        email: 'unknown@example.com',
        specializations: []
      };

      const fallbackMonitor = new BaseMonitor('user');

      console.log(`[HallMonitorFactory] 🔄 Returning fallback monitor for user: ${userId}`);
      
      return { user: fallbackUser, monitor: fallbackMonitor };
    }
  }

  // ✅ GET MONITOR FOR ROLE
  private getMonitorForRole(roleName: string): HallMonitor {
    console.log(`[HallMonitorFactory] 🏭 Creating monitor for role: ${roleName}`);

    switch (roleName.toLowerCase()) {
      case 'admin':
        return new AdminMonitor();
      
      case 'jobcoach':
        return new JobCoachMonitor();
      
      case 'client':
        console.log(`[HallMonitorFactory] ✅ Creating ClientMonitor`);
        return new ClientMonitor();
      
      case 'user':
      default:
        console.log(`[HallMonitorFactory] ⚠️ Unknown role: ${roleName}, using BaseMonitor`);
        return new BaseMonitor(roleName);
    }
  }

  // ✅ BUILD USER DATA USING YOUR EXISTING APIS - NO MORE RAW DATABASE CALLS
  private async buildUserDataFromYourAPIs(userId: string): Promise<MonitorUser | null> {
    try {
      console.log(`[HallMonitorFactory] 📋 Building user data via your existing APIs for: ${userId}`);

      // ✅ Step 1: Get profile using your /api/profile/{userId} endpoint
      const profile = await APIClient.getUserProfile(userId);
      if (!profile) {
        console.error(`[HallMonitorFactory] ❌ Could not get profile for user: ${userId}`);
        return null;
      }

      // ✅ Step 2: Map role using your existing ROLE_MAP logic
      const roleName = ROLE_MAP[profile.role] || 'user';
      console.log(`[HallMonitorFactory] ✅ Role mapped: ${profile.role} -> ${roleName}`);

      // ✅ Step 3: Get email using your /api/get-all-users endpoint
      const email = await APIClient.getUserEmail(userId);
      console.log(`[HallMonitorFactory] 📧 Email retrieved via API: ${email}`);

      // ✅ Step 4: Get specializations using your existing API
      const specializations = await APIClient.getUserSpecializations(userId);
      console.log(`[HallMonitorFactory] ✅ Found ${specializations.length} specializations via your API`);

      // ✅ Build final user object
      const userData: MonitorUser = {
        id: userId,
        role_id: profile.role,
        role_name: roleName,
        email: email,
        display_name: profile.display_name || email.split('@')[0] || 'User',
        specializations
      };

      console.log(`[HallMonitorFactory] 🎉 Complete user data built via your APIs:`, {
        id: userData.id,
        role_id: userData.role_id,
        role_name: userData.role_name,
        email: '[PROVIDED]',
        specializationCount: userData.specializations?.length || 0,
        displayName: userData.display_name
      });

      return userData;

    } catch (error) {
      console.error(`[HallMonitorFactory] ❌ Error building user data via your APIs:`, error);
      return null;
    }
  }

  // ✅ CACHE MANAGEMENT
  clearUserCache(userId: string): void {
    this.userCache.delete(userId);
    console.log(`[HallMonitorFactory] 🗑️ Cache cleared for user: ${userId}`);
  }

  clearAllCache(): void {
    this.userCache.clear();
    console.log(`[HallMonitorFactory] 🗑️ All cache cleared`);
  }
}

// ✅ EXPORT SINGLETON INSTANCE
export const hallMonitorFactory = HallMonitorFactory.getInstance();