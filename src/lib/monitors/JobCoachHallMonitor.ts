// lib/monitors/JobCoachHallMonitor.ts
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
  JOBCOACH_SPECIALIZATIONS,
  HallMonitorError
} from '@/types/monitors';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class JobCoachHallMonitor implements HallMonitor {
  role_name = 'jobcoach'; // ✅ FIXED: Changed from 'role' to 'role_name'

  // Core access control method
  async checkAccess(
    userId: string,
    resource: string,
    action: string,
    context?: AccessContext
  ): Promise<AccessResult> {
    try {
      console.log(`[JobCoachHallMonitor] Checking access for ${userId}: ${resource}:${action}`);

      // First verify user is job coach and has specializations
      const userSpecializations = await this.getSpecializations(userId);
      if (userSpecializations.length === 0) {
        return {
          hasAccess: false,
          reason: 'User has no job coach specializations'
        };
      }

      // Get user's job coach specialization names
      const specializationNames = userSpecializations.map(s => s.name);
      console.log(`[JobCoachHallMonitor] User specializations:`, specializationNames);

      // Check access based on resource and action
      const accessResult = this.checkSpecializationAccess(
        resource,
        action,
        specializationNames,
        context
      );

      console.log(`[JobCoachHallMonitor] Access result:`, accessResult);
      return accessResult;

    } catch (error) {
      console.error('[JobCoachHallMonitor] Access check error:', error);
      return {
        hasAccess: false,
        reason: 'Access check failed due to error',
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Check access based on job coach specializations
  private checkSpecializationAccess(
    resource: string,
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    switch (resource) {
      case RESOURCES.CLIENTS:
        return this.checkClientAccess(action, specializations, context);
      
      case RESOURCES.SESSIONS:
        return this.checkSessionAccess(action, specializations, context);
      
      case RESOURCES.CONTENT:
        return this.checkContentAccess(action, specializations, context);
      
      case RESOURCES.TRAINING:
        return this.checkTrainingAccess(action, specializations, context);
      
      case RESOURCES.ANALYTICS:
        return this.checkAnalyticsAccess(action, specializations, context);
      
      case RESOURCES.DASHBOARD:
        return this.checkDashboardAccess(action, specializations, context);
      
      case RESOURCES.PROFILE:
        return this.checkProfileAccess(action, specializations, context);
      
      case RESOURCES.MESSAGES:
        return this.checkMessagingAccess(action, specializations, context);
      
      default:
        // For unknown resources, allow basic read access for all job coaches
        if (action === ACTIONS.READ) {
          return {
            hasAccess: true,
            reason: 'Job coach can read general resources'
          };
        }
        return {
          hasAccess: false,
          reason: `Unknown resource: ${resource}`
        };
    }
  }

  // Client access (Career Counselor + Employment Specialist)
  private checkClientAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const clientAccessSpecs = [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ];

    const hasClientAccess = specializations.some(spec => 
      clientAccessSpecs.includes(spec as any)
    );

    if (!hasClientAccess) {
      return {
        hasAccess: false,
        reason: 'Requires Career Counselor or Employment Specialist specialization for client access'
      };
    }

    // Check if accessing own assigned clients vs all clients
    const targetClientId = context?.clientId;
    if (targetClientId && action !== ACTIONS.READ) {
      // For modify actions, check if this coach is assigned to the client
      // This would require additional database check in real implementation
      console.log(`[JobCoachHallMonitor] Should verify coach is assigned to client ${targetClientId}`);
    }

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can view client profiles`
        };
      
      case ACTIONS.UPDATE:
        // Career Counselors and Employment Specialists can update client info
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can update client profiles`
        };
      
      case ACTIONS.CREATE:
        // Only Employment Specialists can create new client profiles
        const canCreate = specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST);
        return {
          hasAccess: canCreate,
          reason: canCreate 
            ? 'Employment Specialist can create client profiles'
            : 'Only Employment Specialists can create new client profiles'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown client action: ${action}`
        };
    }
  }

  // Session access (Career Counselor + Employment Specialist)
  private checkSessionAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    const sessionAccessSpecs = [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ];

    const hasSessionAccess = specializations.some(spec => 
      sessionAccessSpecs.includes(spec as any)
    );

    if (!hasSessionAccess) {
      return {
        hasAccess: false,
        reason: 'Requires Career Counselor or Employment Specialist specialization for session management'
      };
    }

    switch (action) {
      case ACTIONS.CREATE:
      case ACTIONS.SCHEDULE:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can schedule sessions`
        };
      
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can view sessions`
        };
      
      case ACTIONS.UPDATE:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can modify sessions`
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown session action: ${action}`
        };
    }
  }

  // Content access (Skills Trainer can create, others can read)
  private checkContentAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    switch (action) {
      case ACTIONS.READ:
        // All job coaches can read training content
        return {
          hasAccess: true,
          reason: 'All job coaches can access training content'
        };
      
      case ACTIONS.CREATE:
      case ACTIONS.UPDATE:
        // Only Skills Trainers can create/modify content
        const hasSkillsTrainer = specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER);
        return {
          hasAccess: hasSkillsTrainer,
          reason: hasSkillsTrainer 
            ? 'Skills Trainer can create and modify training content'
            : 'Only Skills Trainers can create or modify content'
        };
      
      case ACTIONS.DELETE:
        // Only Skills Trainers can delete their own content
        const canDelete = specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER);
        return {
          hasAccess: canDelete,
          reason: canDelete 
            ? 'Skills Trainer can delete content'
            : 'Only Skills Trainers can delete content'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown content action: ${action}`
        };
    }
  }

  // Training access (Skills Trainer primary, others can assist)
  private checkTrainingAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const hasSkillsTrainer = specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER);

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: 'All job coaches can view training materials'
        };
      
      case ACTIONS.CREATE:
      case ACTIONS.MANAGE:
        return {
          hasAccess: hasSkillsTrainer,
          reason: hasSkillsTrainer 
            ? 'Skills Trainer can create and manage training programs'
            : 'Only Skills Trainers can create and manage training programs'
        };
      
      default:
        return {
          hasAccess: hasSkillsTrainer,
          reason: hasSkillsTrainer 
            ? `Skills Trainer can ${action} training`
            : 'Requires Skills Trainer specialization'
        };
    }
  }

  // Analytics access (Employment Specialist gets full access, others get limited)
  private checkAnalyticsAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const hasEmploymentSpecialist = specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST);

    if (action === ACTIONS.READ) {
      if (hasEmploymentSpecialist) {
        return {
          hasAccess: true,
          reason: 'Employment Specialist has full analytics access'
        };
      }
      // Others get limited analytics
      return {
        hasAccess: true,
        reason: 'Job coach has limited analytics access',
        context: { scope: 'limited' }
      };
    }

    // Only Employment Specialists can modify analytics
    return {
      hasAccess: hasEmploymentSpecialist,
      reason: hasEmploymentSpecialist 
        ? `Employment Specialist can ${action} analytics`
        : 'Only Employment Specialists can modify analytics'
    };
  }

  // Dashboard access (all job coaches)
  private checkDashboardAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    return {
      hasAccess: true,
      reason: 'All job coaches can access dashboard'
    };
  }

  // Profile access (own profile + assigned clients)
  private checkProfileAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const targetUserId = context?.targetUserId;
    
    // Always allow access to own profile
    if (!targetUserId || action === ACTIONS.READ) {
      return {
        hasAccess: true,
        reason: 'Job coach can access own profile'
      };
    }

    // For other profiles, need client access specializations
    const hasClientAccess = specializations.some(spec => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(spec as any));

    return {
      hasAccess: hasClientAccess,
      reason: hasClientAccess 
        ? 'Job coach can access assigned client profiles'
        : 'Requires Career Counselor or Employment Specialist specialization'
    };
  }

  // Messaging access (all job coaches)
  private checkMessagingAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    return {
      hasAccess: true,
      reason: 'All job coaches can use messaging'
    };
  }

  // Get content configuration for job coach user
  async getContentConfig(userId: string): Promise<ContentConfig> {
    try {
      const specializations = await this.getSpecializations(userId);
      const specializationNames = specializations.map(s => s.name);

      // Determine dashboard layout based on primary specialization
      let dashboardLayout: ContentConfig['dashboardLayout'] = 'jobcoach-counselor';
      if (specializationNames.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
        dashboardLayout = 'jobcoach-trainer';
      } else if (specializationNames.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
        dashboardLayout = 'jobcoach-specialist';
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
      console.error('[JobCoachHallMonitor] Error getting content config:', error);
      throw new HallMonitorError(
        'Failed to get job coach content configuration',
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
      FEATURES.PROFILE_VIEW
    ];

    if (specializations.some(s => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(s as any))) {
      features.push(
        FEATURES.CLIENT_PROFILES,
        FEATURES.SESSION_SCHEDULER,
        FEATURES.PROGRESS_TRACKING
      );
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      features.push(
        FEATURES.TRAINING_CONTENT,
        FEATURES.CONTENT_EDITOR
      );
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      features.push(
        FEATURES.ANALYTICS_DASHBOARD
      );
    }

    return features;
  }

  // Build navigation items for job coach
  private async buildNavigationItems(userId: string, specializations: string[]): Promise<NavigationItem[]> {
    const navItems: NavigationItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard/jobcoach',
        icon: 'LayoutDashboard'
      }
    ];

    // Client management for Career Counselors and Employment Specialists
    if (specializations.some(s => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(s as any))) {
      navItems.push({
        id: 'clients',
        label: 'Clients',
        href: '/dashboard/jobcoach/clients',
        icon: 'Users',
        children: [
          {
            id: 'client-list',
            label: 'My Clients',
            href: '/dashboard/jobcoach/clients',
            icon: 'List'
          },
          {
            id: 'client-progress',
            label: 'Progress Tracking',
            href: '/dashboard/jobcoach/clients/progress',
            icon: 'TrendingUp'
          }
        ]
      });

      navItems.push({
        id: 'sessions',
        label: 'Sessions',
        href: '/dashboard/jobcoach/sessions',
        icon: 'Calendar',
        children: [
          {
            id: 'schedule',
            label: 'Schedule',
            href: '/dashboard/jobcoach/sessions/schedule',
            icon: 'CalendarPlus'
          },
          {
            id: 'upcoming',
            label: 'Upcoming',
            href: '/dashboard/jobcoach/sessions/upcoming',
            icon: 'Clock'
          }
        ]
      });
    }

    // Training content for Skills Trainers
    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      navItems.push({
        id: 'training',
        label: 'Training',
        href: '/dashboard/jobcoach/training',
        icon: 'BookOpen',
        children: [
          {
            id: 'content-library',
            label: 'Content Library',
            href: '/dashboard/jobcoach/training/library',
            icon: 'Library'
          },
          {
            id: 'create-content',
            label: 'Create Content',
            href: '/dashboard/jobcoach/training/create',
            icon: 'PlusCircle'
          },
          {
            id: 'assessments',
            label: 'Assessments',
            href: '/dashboard/jobcoach/training/assessments',
            icon: 'ClipboardCheck'
          }
        ]
      });
    }

    // Analytics for Employment Specialists
    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      navItems.push({
        id: 'analytics',
        label: 'Analytics',
        href: '/dashboard/jobcoach/analytics',
        icon: 'BarChart3',
        children: [
          {
            id: 'client-outcomes',
            label: 'Client Outcomes',
            href: '/dashboard/jobcoach/analytics/outcomes',
            icon: 'Target'
          },
          {
            id: 'employment-stats',
            label: 'Employment Stats',
            href: '/dashboard/jobcoach/analytics/employment',
            icon: 'Briefcase'
          }
        ]
      });
    }

    // Messages for all
    navItems.push({
      id: 'messages',
      label: 'Messages',
      href: '/dashboard/jobcoach/messages',
      icon: 'MessageSquare'
    });

    return navItems;
  }

  // Get primary actions based on specializations
  private getPrimaryActions(specializations: string[]): string[] {
    const actions: string[] = [];

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR)) {
      actions.push('schedule-session', 'update-client-progress');
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      actions.push('create-training-content', 'assign-assessment');
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      actions.push('track-employment-outcomes', 'generate-reports');
    }

    return actions;
  }

  // Get secondary actions
  private getSecondaryActions(specializations: string[]): string[] {
    return ['send-message', 'export-client-data', 'schedule-meeting'];
  }

  // Get hidden sections based on specializations
  private getHiddenSections(specializations: string[]): string[] {
    const hidden: string[] = [];

    // Hide client management if no client access specialization
    if (!specializations.some(s => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(s as any))) {
      hidden.push('client-management', 'session-scheduling');
    }

    // Hide training content creation if not Skills Trainer
    if (!specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      hidden.push('content-creation', 'training-management');
    }

    // Hide advanced analytics if not Employment Specialist
    if (!specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      hidden.push('advanced-analytics', 'outcome-reporting');
    }

    return hidden;
  }

  // Get custom fields based on specializations
  private getCustomFields(specializations: string[]): Record<string, any> {
    const fields: Record<string, any> = {};

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR)) {
      fields.clientProfile = {
        showCareerGoals: true,
        enableProgressNotes: true,
        showSessionHistory: true
      };
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      fields.trainingContent = {
        allowVideoUpload: true,
        enableQuizCreation: true,
        showCompletionStats: true
      };
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      fields.analytics = {
        showOutcomeMetrics: true,
        enableCustomReports: true,
        allowDataExport: true
      };
    }

    return fields;
  }

  // Get visible components
  private getVisibleComponents(specializations: string[]): string[] {
    const components = ['jobcoach-dashboard', 'message-center'];

    if (specializations.some(s => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(s as any))) {
      components.push('client-list', 'session-calendar', 'progress-tracker');
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      components.push('content-editor', 'training-library', 'assessment-builder');
    }

    if (specializations.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      components.push('analytics-dashboard', 'outcome-tracker', 'report-generator');
    }

    return components;
  }

  // Get user specializations (jobcoach role only)
  async getSpecializations(userId: string): Promise<UserSpecialization[]> {
    try {
      const { data, error } = await supabase.rpc('get_user_specializations', {
        user_uuid: userId
      });

      if (error) {
        console.error('[JobCoachHallMonitor] Error fetching specializations:', error);
        return [];
      }

      // Filter to only jobcoach role specializations
      const jobcoachSpecializations = (data || []).filter((spec: any) => 
        spec.role_name === 'jobcoach'
      );

      console.log(`[JobCoachHallMonitor] Found ${jobcoachSpecializations.length} job coach specializations for user ${userId}`);
      return jobcoachSpecializations;
    } catch (error) {
      console.error('[JobCoachHallMonitor] Specializations fetch error:', error);
      return [];
    }
  }

  // Check if user has specific specialization
  async hasSpecialization(userId: string, specializationName: string): Promise<boolean> {
    const specializations = await this.getSpecializations(userId);
    return specializations.some(spec => spec.name === specializationName);
  }

  // Get permissions for job coach user
  async getPermissions(userId: string): Promise<string[]> {
    const specializations = await this.getSpecializations(userId);
    const specializationNames = specializations.map(s => s.name);
    
    const permissions: string[] = [
      'dashboard:read',
      'profile:read',
      'profile:update',
      'messages:send',
      'messages:read',
      'notifications:read'
    ];

    // Add specialization-specific permissions
    if (specializationNames.some(s => [
      JOBCOACH_SPECIALIZATIONS.CAREER_COUNSELOR,
      JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST
    ].includes(s as any))) {
      permissions.push(
        'clients:read',
        'clients:update',
        'sessions:create',
        'sessions:read',
        'sessions:update'
      );
    }

    if (specializationNames.includes(JOBCOACH_SPECIALIZATIONS.SKILLS_TRAINER)) {
      permissions.push(
        'training:create',
        'training:read',
        'training:update',
        'content:create',
        'content:read',
        'content:update'
      );
    }

    if (specializationNames.includes(JOBCOACH_SPECIALIZATIONS.EMPLOYMENT_SPECIALIST)) {
      permissions.push(
        'analytics:read',
        'outcomes:track',
        'reports:generate',
        'clients:create'
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