// hooks/useAuth.ts - Persistent authentication hook
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { storage, CACHE_KEYS } from '@/lib/cookieUtils';

interface User {
  id: string;
  email?: string;
  user_metadata?: any;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Global state to share across components
let globalAuthState: AuthState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null
};

let globalStateListeners: Array<(state: AuthState) => void> = [];
let authInitialized = false;
let authPromise: Promise<void> | null = null;

// Notify all listeners of state changes
function notifyListeners(newState: AuthState) {
  globalAuthState = newState;
  globalStateListeners.forEach(listener => listener(newState));
}

// Initialize authentication once globally
async function initializeAuth(): Promise<void> {
  if (authInitialized || authPromise) {
    return authPromise || Promise.resolve();
  }

  console.log('🔐 [AUTH] Initializing global authentication...');
  
  authPromise = (async () => {
    try {
      // First, try to get cached user for immediate UI update
      const cachedUser = storage.get(CACHE_KEYS.CURRENT_USER) as User | null;
      if (cachedUser?.id) {
        console.log('🔐 [AUTH] Found cached user:', cachedUser.id);
        notifyListeners({
          user: cachedUser,
          isLoading: true, // Still loading to verify with Supabase
          isAuthenticated: true,
          error: null
        });
      }

      // Then verify with Supabase
      console.log('🔐 [AUTH] Verifying session with Supabase...');
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('🔐 [AUTH] Session verification failed:', error);
        // Clear invalid cached data
        storage.remove(CACHE_KEYS.CURRENT_USER);
        notifyListeners({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: error.message
        });
        return;
      }

      if (user) {
        console.log('🔐 [AUTH] Session verified successfully:', user.id);
        const userData: User = {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata
        };
        
        // Cache the verified user
        storage.set(CACHE_KEYS.CURRENT_USER, userData, 3600); // 1 hour cache
        
        notifyListeners({
          user: userData,
          isLoading: false,
          isAuthenticated: true,
          error: null
        });
      } else {
        console.log('🔐 [AUTH] No active session found');
        storage.remove(CACHE_KEYS.CURRENT_USER);
        notifyListeners({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null
        });
      }
    } catch (err) {
      console.error('🔐 [AUTH] Initialization error:', err);
      notifyListeners({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: err instanceof Error ? err.message : 'Authentication failed'
      });
    } finally {
      authInitialized = true;
      authPromise = null;
    }
  })();

  return authPromise;
}

// Set up auth state change listener (only once)
let authListenerSetup = false;
function setupAuthListener() {
  if (authListenerSetup) return;
  authListenerSetup = true;

  console.log('🔐 [AUTH] Setting up auth state listener...');
  
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('🔐 [AUTH] Auth state changed:', event, session?.user?.id);
    
    switch (event) {
      case 'SIGNED_IN':
        if (session?.user) {
          const userData: User = {
            id: session.user.id,
            email: session.user.email,
            user_metadata: session.user.user_metadata
          };
          storage.set(CACHE_KEYS.CURRENT_USER, userData, 3600);
          notifyListeners({
            user: userData,
            isLoading: false,
            isAuthenticated: true,
            error: null
          });
        }
        break;
        
      case 'SIGNED_OUT':
        console.log('🔐 [AUTH] User signed out');
        storage.remove(CACHE_KEYS.CURRENT_USER);
        storage.remove(CACHE_KEYS.CONVERSATIONS); // Clear conversations too
        notifyListeners({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: null
        });
        break;
        
      case 'TOKEN_REFRESHED':
        console.log('🔐 [AUTH] Token refreshed');
        if (session?.user) {
          const userData: User = {
            id: session.user.id,
            email: session.user.email,
            user_metadata: session.user.user_metadata
          };
          storage.set(CACHE_KEYS.CURRENT_USER, userData, 3600);
          notifyListeners({
            user: userData,
            isLoading: false,
            isAuthenticated: true,
            error: null
          });
        }
        break;
    }
  });
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(globalAuthState);
  const listenerRef = useRef<(state: AuthState) => void>();

  // Set up listener for this component
  useEffect(() => {
    console.log('🔐 [AUTH] useAuth hook mounted');
    
    // Create listener function
    listenerRef.current = (newState: AuthState) => {
      setAuthState(newState);
    };
    
    // Add to global listeners
    globalStateListeners.push(listenerRef.current);
    
    // Set up auth listener (only happens once globally)
    setupAuthListener();
    
    // Initialize auth if not already done
    if (!authInitialized && !authPromise) {
      initializeAuth();
    } else if (authInitialized) {
      // If already initialized, use current state
      setAuthState(globalAuthState);
    }
    
    return () => {
      // Remove listener on unmount
      if (listenerRef.current) {
        const index = globalStateListeners.indexOf(listenerRef.current);
        if (index > -1) {
          globalStateListeners.splice(index, 1);
        }
      }
    };
  }, []);

  // Manual refresh function
  const refreshAuth = useCallback(async () => {
    console.log('🔐 [AUTH] Manual refresh requested');
    authInitialized = false;
    authPromise = null;
    await initializeAuth();
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    console.log('🔐 [AUTH] Sign out requested');
    try {
      await supabase.auth.signOut();
      // State will be updated by the auth listener
    } catch (err) {
      console.error('🔐 [AUTH] Sign out error:', err);
    }
  }, []);

  return {
    user: authState.user,
    isLoading: authState.isLoading,
    isAuthenticated: authState.isAuthenticated,
    error: authState.error,
    refreshAuth,
    signOut
  };
}