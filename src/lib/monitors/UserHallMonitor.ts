// lib/monitors/UserHallMonitor.ts - FIXED VERSION
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
  HallMonitorError
} from '@/types/monitors';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export class UserHallMonitor implements HallMonitor {
  role_name = 'user'; // ✅ FIXED: Changed from 'role' to 'role_name'

  // Core access control method
  async checkAccess(
    userId: string,
    resource: string,
    action: string,
    context?: AccessContext
  ): Promise<AccessResult> {
    try {
      console.log(`[UserHallMonitor] Checking access for ${userId}: ${resource}:${action}`);

      // Basic user access control - very limited permissions
      const accessResult = this.checkBasicUserAccess(resource, action, context, userId);

      console.log(`[UserHallMonitor] Access result:`, accessResult);
      return accessResult;

    } catch (error) {
      console.error('[UserHallMonitor] Access check error:', error);
      return {
        hasAccess: false,
        reason: 'Access check failed due to error',
        context: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  // Check basic user access - very limited permissions
  private checkBasicUserAccess(
    resource: string,
    action: string,
    context?: AccessContext,
    userId?: string
  ): AccessResult {
    
    switch (resource) {
      case RESOURCES.PROFILE:
        return this.checkProfileAccess(action, context, userId);
      
      case 'public_content':
        return this.checkPublicContentAccess(action, context);
      
      case 'donations':
        return this.checkDonationAccess(action, context);
      
      case 'reviews':
        return this.checkReviewAccess(action, context, userId);
      
      case 'newsletter':
        return this.checkNewsletterAccess(action, context);
      
      case 'contact':
        return this.checkContactAccess(action, context);
      
      default:
        // For unknown resources, deny access
        return {
          hasAccess: false,
          reason: `Basic users cannot access ${resource}`
        };
    }
  }

  // Profile access - can only access their own profile
  private checkProfileAccess(
    action: string,
    context?: AccessContext,
    userId?: string
  ): AccessResult {
    const targetUserId = context?.targetUserId;
    
    // Can only access own profile
    if (targetUserId && targetUserId !== userId) {
      return {
        hasAccess: false,
        reason: 'Users can only access their own profile'
      };
    }

    switch (action) {
      case ACTIONS.READ:
      case ACTIONS.UPDATE:
        return {
          hasAccess: true,
          reason: 'User can read and update own profile'
        };
      
      case ACTIONS.DELETE:
        return {
          hasAccess: false,
          reason: 'Users cannot delete their own profile - contact support'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown profile action: ${action}`
        };
    }
  }

  // Public content access - can read public content
  private checkPublicContentAccess(action: string, context?: AccessContext): AccessResult {
    if (action === ACTIONS.READ) {
      return {
        hasAccess: true,
        reason: 'Users can read public content'
      };
    }

    return {
      hasAccess: false,
      reason: 'Users can only read public content, not modify it'
    };
  }

  // Donation access - can make donations
  private checkDonationAccess(action: string, context?: AccessContext): AccessResult {
    switch (action) {
      case ACTIONS.CREATE:
        return {
          hasAccess: true,
          reason: 'Users can make donations'
        };
      
      case ACTIONS.READ:
        // Can only read their own donation history
        return {
          hasAccess: true,
          reason: 'Users can view their own donation history'
        };
      
      default:
        return {
          hasAccess: false,
          reason: 'Users can only create donations and view their own history'
        };
    }
  }

  // Review access - future feature for users to leave reviews
  private checkReviewAccess(
    action: string,
    context?: AccessContext,
    userId?: string
  ): AccessResult {
    switch (action) {
      case ACTIONS.CREATE:
        return {
          hasAccess: true,
          reason: 'Users can create reviews'
        };
      
      case ACTIONS.READ:
        return {
          hasAccess: true,
          reason: 'Users can read reviews'
        };
      
      case ACTIONS.UPDATE:
      case ACTIONS.DELETE:
        // Can only edit/delete their own reviews
        const reviewAuthorId = context?.metadata?.authorId;
        if (reviewAuthorId && reviewAuthorId === userId) {
          return {
            hasAccess: true,
            reason: 'Users can edit/delete their own reviews'
          };
        }
        return {
          hasAccess: false,
          reason: 'Users can only edit/delete their own reviews'
        };
      
      default:
        return {
          hasAccess: false,
          reason: `Unknown review action: ${action}`
        };
    }
  }

  // Newsletter access - can subscribe/unsubscribe
  private checkNewsletterAccess(action: string, context?: AccessContext): AccessResult {
    switch (action) {
      case 'subscribe':
      case 'unsubscribe':
        return {
          hasAccess: true,
          reason: 'Users can manage newsletter subscription'
        };
      
      default:
        return {
          hasAccess: false,
          reason: 'Users can only subscribe/unsubscribe to newsletter'
        };
    }
  }

  // Contact access - can send contact messages
  private checkContactAccess(action: string, context?: AccessContext): AccessResult {
    if (action === ACTIONS.CREATE) {
      return {
        hasAccess: true,
        reason: 'Users can send contact messages'
      };
    }

    return {
      hasAccess: false,
      reason: 'Users can only send contact messages'
    };
  }

  // Get content configuration for basic user
  async getContentConfig(userId: string): Promise<ContentConfig> {
    try {
      console.log('[UserHallMonitor] Getting content config for user:', userId);
      
      // Basic users have very minimal configuration
      const availableFeatures = [
        FEATURES.PROFILE_VIEW,
        'public-content',
        'donations',
        'reviews', // Future feature
        'newsletter',
        'contact'
      ];

      const navigationItems = await this.buildNavigationItems(userId);
      const permissions = await this.getPermissions(userId);

      const config: ContentConfig = {
        dashboardLayout: 'user-basic',
        availableFeatures,
        primaryActions: [
          'view-profile',
          'make-donation',
          'contact-support'
        ],
        secondaryActions: [
          'subscribe-newsletter',
          'leave-review',
          'view-public-content'
        ],
        navigationItems,
        hiddenSections: [
          // Hide all advanced features
          'admin-panel',
          'client-management',
          'session-booking',
          'analytics',
          'content-editor',
          'user-management'
        ],
        customFields: {
          publicProfile: {
            showBasicInfo: true,
            allowDonorBadge: true, // Show if they've donated
            showReviewCount: true // Show their review contributions
          }
        },
        visibleComponents: [
          'public-content-viewer',
          'donation-widget',
          'contact-form',
          'newsletter-signup',
          'review-system' // Future
        ],
        permissions
      };

      console.log('[UserHallMonitor] ✅ Content config created for user:', userId, config);
      return config;

    } catch (error) {
      console.error('[UserHallMonitor] Error getting content config:', error);
      throw new HallMonitorError(
        'Failed to get user content configuration',
        'CONFIG_ERROR',
        { userId, error }
      );
    }
  }

  // Build navigation items for basic users
  private async buildNavigationItems(userId: string): Promise<NavigationItem[]> {
    const navItems: NavigationItem[] = [
      {
        id: 'home',
        label: 'Home',
        href: '/',
        icon: 'Home'
      },
      {
        id: 'about',
        label: 'About',
        href: '/about',
        icon: 'Info'
      },
      {
        id: 'services',
        label: 'Services',
        href: '/services',
        icon: 'Briefcase'
      },
      {
        id: 'profile',
        label: 'My Profile',
        href: '/profile',
        icon: 'User'
      },
      {
        id: 'donations',
        label: 'Support Us',
        href: '/donate',
        icon: 'Heart'
      },
      {
        id: 'contact',
        label: 'Contact',
        href: '/contact',
        icon: 'Mail'
      }
    ];

    // Future: Add reviews section when implemented
    // navItems.push({
    //   id: 'reviews',
    //   label: 'Reviews',
    //   href: '/reviews',
    //   icon: 'Star'
    // });

    return navItems;
  }

  // Get user specializations (basic users don't have specializations)
  async getSpecializations(userId: string): Promise<UserSpecialization[]> {
    // Basic users don't have specializations
    console.log(`[UserHallMonitor] Basic users don't have specializations`);
    return [];
  }

  // Check if user has specific specialization (always false for basic users)
  async hasSpecialization(userId: string, specializationName: string): Promise<boolean> {
    // Basic users never have specializations
    return false;
  }

  // Get permissions for basic user
  async getPermissions(userId: string): Promise<string[]> {
    // Very basic permissions for regular users
    return [
      'profile:read_own',
      'profile:update_own',
      'public_content:read',
      'donations:create',
      'donations:read_own',
      'newsletter:subscribe',
      'newsletter:unsubscribe',
      'contact:create',
      'reviews:create', // Future
      'reviews:read',   // Future
      'reviews:update_own', // Future
      'reviews:delete_own'  // Future
    ];
  }

  // Check if user can access a specific feature
  async canAccessFeature(userId: string, feature: string): Promise<boolean> {
    const config = await this.getContentConfig(userId);
    return config.availableFeatures.includes(feature);
  }

  // Get navigation items for user
  async getNavigationItems(userId: string): Promise<NavigationItem[]> {
    return this.buildNavigationItems(userId);
  }
}