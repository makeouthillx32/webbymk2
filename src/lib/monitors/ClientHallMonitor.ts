// lib/monitors/ClientHallMonitor.ts
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
  CLIENT_SPECIALIZATIONS,
  HallMonitorError
} from '@/types/monitors';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class ClientHallMonitor implements HallMonitor {
  role_name = 'client';

  // Core access control method
  async checkAccess(
    userId: string,
    resource: string,
    action: string,
    context?: AccessContext
  ): Promise<AccessResult> {
    try {
      console.log(`[ClientHallMonitor] Checking access for ${userId}: ${resource}:${action}`);

      // First verify user is client and has specializations
      const userSpecializations = await this.getSpecializations(userId);
      if (userSpecializations.length === 0) {
        return {
          hasAccess: false,
          reason: 'User has no client specializations'
        };
      }

      // Get user's client specialization names
      const specializationNames = userSpecializations.map(s => s.name);
      console.log(`[ClientHallMonitor] User specializations:`, specializationNames);

      // Check access based on resource and action
      const accessResult = this.checkSpecializationAccess(
        resource,
        action,
        specializationNames,
        context,
        userId
      );

      console.log(`[ClientHallMonitor] Access result:`, accessResult);
      return accessResult;

    } catch (error) {
      console.error('[ClientHallMonitor] Access check error:', error);
      return {
        hasAccess: false,
        reason: 'Access check failed due to error',
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Check access based on client specializations
  private checkSpecializationAccess(
    resource: string,
    action: string,
    specializations: string[],
    context?: AccessContext,
    userId?: string
  ): AccessResult {
    
    switch (resource) {
      case RESOURCES.PROFILE:
        return this.checkProfileAccess(action, specializations, context, userId);
      
      case RESOURCES.SESSIONS:
        return this.checkSessionAccess(action, specializations, context);
      
      case RESOURCES.APPLICATIONS:
        return this.checkApplicationAccess(action, specializations, context);
      
      case RESOURCES.RESOURCES:
        return this.checkResourceAccess(action, specializations, context);
      
      case RESOURCES.COURSES:
        return this.checkCourseAccess(action, specializations, context);
      
      case RESOURCES.DASHBOARD:
        return this.checkDashboardAccess(action, specializations, context);
      
      case RESOURCES.MESSAGES:
        return this.checkMessagingAccess(action, specializations, context);
      
      case RESOURCES.NOTIFICATIONS:
        return this.checkNotificationAccess(action, specializations, context);
      
      default:
        // For unknown resources, allow basic read access for all clients
        if (action === ACTIONS.READ) {
          return {
            hasAccess: true,
            reason: 'Client can read general resources'
          };
        }
        return {
          hasAccess: false,
          reason: `Unknown resource: ${resource}`
        };
    }
  }

  // Profile access (own profile only, with specialization-specific fields)
  private checkProfileAccess(
    action: string,
    specializations: string[],
    context?: AccessContext,
    userId?: string
  ): AccessResult {
    
    const targetUserId = context?.targetUserId;
    
    // Can only access own profile
    if (targetUserId && targetUserId !== userId) {
      return {
        hasAccess: false,
        reason: 'Clients can only access their own profile'
      };
    }

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: 'Client can view own profile'
        };
      
      case ACTIONS.UPDATE:
        return {
          hasAccess: true,
          reason: 'Client can update own profile',
          context: { 
            allowedFields: this.getAllowedProfileFields(specializations)
          }
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown profile action: ${action}`
        };
    }
  }

  // Session access (booking and viewing own sessions)
  private checkSessionAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const sessionBookingSpecs = [
      CLIENT_SPECIALIZATIONS.JOB_SEEKER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ];

    const canBookSessions = specializations.some(spec => 
      sessionBookingSpecs.includes(spec as any)
    );

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: 'All clients can view their scheduled sessions'
        };
      
      case ACTIONS.BOOK:
      case ACTIONS.CREATE:
        return {
          hasAccess: canBookSessions,
          reason: canBookSessions 
            ? 'Job Seekers and Career Changers can book sessions'
            : 'Session booking requires Job Seeker or Career Changer specialization'
        };
      
      case ACTIONS.UPDATE:
        return {
          hasAccess: canBookSessions,
          reason: canBookSessions 
            ? 'Can reschedule own sessions'
            : 'Cannot modify sessions without booking privileges'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown session action: ${action}`
        };
    }
  }

  // Job application access (Job Seekers only)
  private checkApplicationAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const hasJobSeeker = specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER);

    if (!hasJobSeeker) {
      return {
        hasAccess: false,
        reason: 'Job application management requires Job Seeker specialization'
      };
    }

    switch (action) {
      case ACTIONS.CREATE:
      case ACTIONS.READ:
      case ACTIONS.UPDATE:
        return {
          hasAccess: true,
          reason: 'Job Seeker can manage job applications'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown application action: ${action}`
        };
    }
  }

  // Resource access (learning materials, tools)
  private checkResourceAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const resourceAccessSpecs = [
      CLIENT_SPECIALIZATIONS.JOB_SEEKER,
      CLIENT_SPECIALIZATIONS.SKILL_BUILDER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ];

    const hasResourceAccess = specializations.some(spec => 
      resourceAccessSpecs.includes(spec as any)
    );

    if (!hasResourceAccess) {
      return {
        hasAccess: false,
        reason: 'Resource access requires Job Seeker, Skill Builder, or Career Changer specialization'
      };
    }

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can access learning resources`
        };
      
      default:
        return {
          hasAccess: false,
          reason: 'Clients can only read resources, not modify them'
        };
    }
  }

  // Course access (Skill Builders and Career Changers)
  private checkCourseAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    const courseAccessSpecs = [
      CLIENT_SPECIALIZATIONS.SKILL_BUILDER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ];

    const hasCourseAccess = specializations.some(spec => 
      courseAccessSpecs.includes(spec as any)
    );

    if (!hasCourseAccess) {
      return {
        hasAccess: false,
        reason: 'Course access requires Skill Builder or Career Changer specialization'
      };
    }

    switch (action) {
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can browse courses`
        };
      
      case ACTIONS.ENROLL:
        return {
          hasAccess: true,
          reason: `${specializations.join(', ')} can enroll in courses`
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown course action: ${action}`
        };
    }
  }

  // Dashboard access (all clients)
  private checkDashboardAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    return {
      hasAccess: true,
      reason: 'All clients can access their dashboard'
    };
  }

  // Messaging access (all clients)
  private checkMessagingAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    switch (action) {
      case ACTIONS.READ:
      case 'send':
        return {
          hasAccess: true,
          reason: 'All clients can use messaging'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown messaging action: ${action}`
        };
    }
  }

  // Notification access (all clients)
  private checkNotificationAccess(
    action: string,
    specializations: string[],
    context?: AccessContext
  ): AccessResult {
    
    if (action === ACTIONS.READ) {
      return {
        hasAccess: true,
        reason: 'All clients can read notifications'
      };
    }

    return {
      hasAccess: false,
      reason: 'Clients can only read notifications'
    };
  }

  // Get allowed profile fields based on specializations
  private getAllowedProfileFields(specializations: string[]): string[] {
    const baseFields = ['name', 'email', 'phone', 'bio', 'avatar'];
    
    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      return [...baseFields, 'resume', 'skills', 'experience', 'job_preferences', 'availability'];
    }
    
    if (specializations.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      return [...baseFields, 'skills', 'learning_goals', 'certifications', 'interests'];
    }
    
    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      return [...baseFields, 'current_career', 'target_career', 'transition_goals', 'timeline'];
    }
    
    return baseFields;
  }

  // Get content configuration for client user
  async getContentConfig(userId: string): Promise<ContentConfig> {
    try {
      const specializations = await this.getSpecializations(userId);
      const specializationNames = specializations.map(s => s.name);

      // Determine dashboard layout based on primary specialization
      let dashboardLayout: ContentConfig['dashboardLayout'] = 'client-basic';
      if (specializationNames.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
        dashboardLayout = 'client-seeker';
      } else if (specializationNames.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
        dashboardLayout = 'client-builder';
      } else if (specializationNames.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
        dashboardLayout = 'client-changer';
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
      console.error('[ClientHallMonitor] Error getting content config:', error);
      throw new HallMonitorError(
        'Failed to get client content configuration',
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
      FEATURES.PROFILE_EDITOR
    ];

    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      features.push(
        FEATURES.JOB_APPLICATIONS,
        FEATURES.SESSION_BOOKING,
        FEATURES.SKILL_ASSESSMENTS
      );
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      features.push(
        FEATURES.COURSE_CATALOG,
        FEATURES.SKILL_ASSESSMENTS
      );
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      features.push(
        FEATURES.SESSION_BOOKING,
        FEATURES.COURSE_CATALOG,
        FEATURES.SKILL_ASSESSMENTS
      );
    }

    return features;
  }

  // Build navigation items for client
  private async buildNavigationItems(userId: string, specializations: string[]): Promise<NavigationItem[]> {
    const navItems: NavigationItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard/client',
        icon: 'LayoutDashboard'
      },
      {
        id: 'profile',
        label: 'My Profile',
        href: '/dashboard/client/profile',
        icon: 'User'
      }
    ];

    // Job Seeker navigation
    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      navItems.push({
        id: 'jobs',
        label: 'Job Search',
        href: '/dashboard/client/jobs',
        icon: 'Briefcase',
        children: [
          {
            id: 'job-search',
            label: 'Find Jobs',
            href: '/dashboard/client/jobs/search',
            icon: 'Search'
          },
          {
            id: 'applications',
            label: 'My Applications',
            href: '/dashboard/client/jobs/applications',
            icon: 'FileText'
          },
          {
            id: 'saved-jobs',
            label: 'Saved Jobs',
            href: '/dashboard/client/jobs/saved',
            icon: 'Bookmark'
          }
        ]
      });

      navItems.push({
        id: 'sessions',
        label: 'Coaching Sessions',
        href: '/dashboard/client/sessions',
        icon: 'Calendar',
        children: [
          {
            id: 'book-session',
            label: 'Book Session',
            href: '/dashboard/client/sessions/book',
            icon: 'CalendarPlus'
          },
          {
            id: 'my-sessions',
            label: 'My Sessions',
            href: '/dashboard/client/sessions',
            icon: 'Clock'
          }
        ]
      });
    }

    // Course access for Skill Builders and Career Changers
    if (specializations.some(s => [
      CLIENT_SPECIALIZATIONS.SKILL_BUILDER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ].includes(s as any))) {
      navItems.push({
        id: 'learning',
        label: 'Learning',
        href: '/dashboard/client/learning',
        icon: 'BookOpen',
        children: [
          {
            id: 'courses',
            label: 'Courses',
            href: '/dashboard/client/learning/courses',
            icon: 'GraduationCap'
          },
          {
            id: 'my-progress',
            label: 'My Progress',
            href: '/dashboard/client/learning/progress',
            icon: 'TrendingUp'
          },
          {
            id: 'certificates',
            label: 'Certificates',
            href: '/dashboard/client/learning/certificates',
            icon: 'Award'
          }
        ]
      });
    }

    // Career Changer specific navigation
    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      navItems.push({
        id: 'career-transition',
        label: 'Career Transition',
        href: '/dashboard/client/transition',
        icon: 'ArrowRightLeft',
        children: [
          {
            id: 'career-assessment',
            label: 'Career Assessment',
            href: '/dashboard/client/transition/assessment',
            icon: 'ClipboardCheck'
          },
          {
            id: 'transition-plan',
            label: 'Transition Plan',
            href: '/dashboard/client/transition/plan',
            icon: 'Map'
          },
          {
            id: 'career-coaching',
            label: 'Career Coaching',
            href: '/dashboard/client/transition/coaching',
            icon: 'UserCheck'
          }
        ]
      });
    }

    // Resources for all specializations
    if (specializations.length > 0) {
      navItems.push({
        id: 'resources',
        label: 'Resources',
        href: '/dashboard/client/resources',
        icon: 'Library',
        children: [
          {
            id: 'tools',
            label: 'Career Tools',
            href: '/dashboard/client/resources/tools',
            icon: 'Wrench'
          },
          {
            id: 'articles',
            label: 'Articles',
            href: '/dashboard/client/resources/articles',
            icon: 'FileText'
          },
          {
            id: 'templates',
            label: 'Templates',
            href: '/dashboard/client/resources/templates',
            icon: 'Copy'
          }
        ]
      });
    }

    // Messages for all
    navItems.push({
      id: 'messages',
      label: 'Messages',
      href: '/dashboard/client/messages',
      icon: 'MessageSquare'
    });

    return navItems;
  }

  // Get primary actions based on specializations
  private getPrimaryActions(specializations: string[]): string[] {
    const actions: string[] = ['update-profile'];

    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      actions.push('apply-to-job', 'book-coaching-session', 'update-resume');
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      actions.push('enroll-in-course', 'take-assessment', 'track-progress');
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      actions.push('create-transition-plan', 'book-career-coaching', 'explore-careers');
    }

    return actions;
  }

  // Get secondary actions
  private getSecondaryActions(specializations: string[]): string[] {
    return ['send-message', 'save-resource', 'share-progress'];
  }

  // Get hidden sections based on specializations
  private getHiddenSections(specializations: string[]): string[] {
    const hidden: string[] = [];

    // Hide job search if not Job Seeker
    if (!specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      hidden.push('job-search', 'application-tracking', 'resume-builder');
    }

    // Hide courses if not Skill Builder or Career Changer
    if (!specializations.some(s => [
      CLIENT_SPECIALIZATIONS.SKILL_BUILDER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ].includes(s as any))) {
      hidden.push('course-catalog', 'learning-progress');
    }

    // Hide career transition tools if not Career Changer
    if (!specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      hidden.push('career-assessment', 'transition-planning');
    }

    // Hide session booking if not Job Seeker or Career Changer
    if (!specializations.some(s => [
      CLIENT_SPECIALIZATIONS.JOB_SEEKER,
      CLIENT_SPECIALIZATIONS.CAREER_CHANGER
    ].includes(s as any))) {
      hidden.push('session-booking', 'coaching-calendar');
    }

    return hidden;
  }

  // Get custom fields based on specializations
  private getCustomFields(specializations: string[]): Record<string, any> {
    const fields: Record<string, any> = {};

    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      fields.profile = {
        showResumeUpload: true,
        enableSkillsMatrix: true,
        showJobPreferences: true,
        enableAvailabilityCalendar: true
      };
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      fields.learning = {
        showProgressDashboard: true,
        enableCertificateDisplay: true,
        showLearningGoals: true
      };
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      fields.transition = {
        showCurrentCareer: true,
        enableTargetCareerSelection: true,
        showTransitionTimeline: true,
        enableMilestoneTracking: true
      };
    }

    return fields;
  }

  // Get visible components
  private getVisibleComponents(specializations: string[]): string[] {
    const components = ['client-dashboard', 'profile-editor', 'message-center'];

    if (specializations.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      components.push('job-search', 'application-tracker', 'resume-builder', 'session-booking');
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      components.push('course-catalog', 'progress-tracker', 'skill-assessment');
    }

    if (specializations.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      components.push('career-explorer', 'transition-planner', 'career-coaching');
    }

    return components;
  }

  // Get user specializations (client role only)
  async getSpecializations(userId: string): Promise<UserSpecialization[]> {
    try {
      const { data, error } = await supabase.rpc('get_user_specializations', {
        user_uuid: userId
      });

      if (error) {
        console.error('[ClientHallMonitor] Error fetching specializations:', error);
        return [];
      }

      // Filter to only client role specializations
      const clientSpecializations = (data || []).filter((spec: any) => 
        spec.role_name === 'client'
      );

      console.log(`[ClientHallMonitor] Found ${clientSpecializations.length} client specializations for user ${userId}`);
      return clientSpecializations;
    } catch (error) {
      console.error('[ClientHallMonitor] Specializations fetch error:', error);
      return [];
    }
  }

  // Check if user has specific specialization
  async hasSpecialization(userId: string, specializationName: string): Promise<boolean> {
    const specializations = await this.getSpecializations(userId);
    return specializations.some(spec => spec.name === specializationName);
  }

  // Get permissions for client user
  async getPermissions(userId: string): Promise<string[]> {
    const specializations = await this.getSpecializations(userId);
    const specializationNames = specializations.map(s => s.name);
    
    const permissions: string[] = [
      'dashboard:read',
      'profile:read_own',
      'profile:update_own',
      'messages:send',
      'messages:read',
      'notifications:read',
      'resources:read'
    ];

    // Add specialization-specific permissions
    if (specializationNames.includes(CLIENT_SPECIALIZATIONS.JOB_SEEKER)) {
      permissions.push(
        'jobs:search',
        'applications:create',
        'applications:read',
        'applications:update',
        'sessions:book',
        'resume:upload'
      );
    }

    if (specializationNames.includes(CLIENT_SPECIALIZATIONS.SKILL_BUILDER)) {
      permissions.push(
        'courses:read',
        'courses:enroll',
        'assessments:take',
        'progress:track'
      );
    }

    if (specializationNames.includes(CLIENT_SPECIALIZATIONS.CAREER_CHANGER)) {
      permissions.push(
        'career:explore',
        'transition:plan',
        'sessions:book',
        'courses:read',
        'courses:enroll'
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