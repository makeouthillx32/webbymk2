// lib/apiCache.ts

import { storage, CACHE_KEYS, CACHE_EXPIRY } from './cookieUtils';

/**
 * API cache interface with request batching and throttling
 */

// Track ongoing requests to avoid duplicates
const pendingRequests: Record<string, Promise<any>> = {};

// Cache responses by URL to avoid unnecessary fetches
interface CacheOptions {
  expiry?: number;
  forceRefresh?: boolean;
  key?: string; // Custom cache key (optional)
}

/**
 * Get data from an API with caching support
 */
export async function cachedFetch<T>(
  url: string, 
  options?: RequestInit & CacheOptions
): Promise<T> {
  const cacheKey = options?.key || `api_${url}`;
  const cacheExpiry = options?.expiry || CACHE_EXPIRY.MEDIUM;
  const forceRefresh = options?.forceRefresh || false;
  
  // Check if request is already in progress for this URL
  if (pendingRequests[url]) {
    console.log(`[API] Using existing request for ${url}`);
    return pendingRequests[url];
  }
  
  // Check for cached response (unless forced refresh)
  if (!forceRefresh) {
    const cachedData = storage.get<T>(cacheKey);
    if (cachedData) {
      console.log(`[API] Using cached data for ${url}`);
      return cachedData;
    }
  }
  
  // Create and store the promise to avoid duplicate requests
  const fetchPromise = (async () => {
    try {
      console.log(`[API] Fetching ${url}`);
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }
      
      const data = await response.json();
      
      // Cache the successful response
      storage.set(cacheKey, data, cacheExpiry);
      
      return data as T;
    } catch (error) {
      console.error(`[API] Error fetching ${url}:`, error);
      
      // Try to return stale cache on error
      const staleData = storage.get<T>(cacheKey, null, true);
      if (staleData) {
        console.log(`[API] Using stale cache for ${url} after error`);
        return staleData;
      }
      
      throw error;
    } finally {
      // Clear the pending request
      delete pendingRequests[url];
    }
  })();
  
  // Store the promise for deduplication
  pendingRequests[url] = fetchPromise;
  
  return fetchPromise;
}

/**
 * Make a POST request with proper error handling
 */
export async function apiPost<T, R>(
  url: string, 
  data: T, 
  options?: RequestInit
): Promise<R> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
      ...options
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`[API] Error posting to ${url}:`, error);
    throw error;
  }
}

/**
 * Chat-specific API functions
 */
export const chatApi = {
  /**
   * Get conversations for the current user
   */
  getConversations: async (forceRefresh = false) => {
    return cachedFetch('/api/messages/get-conversations', {
      credentials: 'include',
      key: CACHE_KEYS.CONVERSATIONS,
      forceRefresh,
      expiry: CACHE_EXPIRY.MEDIUM,
    });
  },
  
  /**
   * Get messages for a specific channel
   */
  getMessages: async (channelId: string, forceRefresh = false) => {
    return cachedFetch(`/api/messages/${channelId}`, {
      credentials: 'include',
      key: `${CACHE_KEYS.MESSAGES_PREFIX}${channelId}`,
      forceRefresh,
      expiry: CACHE_EXPIRY.MEDIUM,
    });
  },
  
  /**
   * Send a message
   */
  sendMessage: async (channelId: string, content: string) => {
    const result = await apiPost('/api/messages/send', {
      channel_id: channelId,
      content,
    });
    
    // Invalidate the messages cache for this channel
    storage.remove(`${CACHE_KEYS.MESSAGES_PREFIX}${channelId}`);
    
    return result;
  },
  
  /**
   * Start a direct message
   */
  startDM: async (userId: string) => {
    const result = await apiPost('/api/messages/start-dm', {
      userIds: [userId],
    });
    
    // Invalidate conversations cache
    storage.remove(CACHE_KEYS.CONVERSATIONS);
    
    return result;
  },
  
  /**
   * Create a group chat
   */
  createGroup: async (name: string, participantIds: string[]) => {
    const result = await apiPost('/api/messages/start-group', {
      name,
      participantIds,
    });
    
    // Invalidate conversations cache
    storage.remove(CACHE_KEYS.CONVERSATIONS);
    
    return result;
  },
  
  /**
   * Get the current user
   */
  getCurrentUser: async () => {
    return cachedFetch('/api/auth/me', {
      credentials: 'include',
      key: CACHE_KEYS.CURRENT_USER,
      expiry: CACHE_EXPIRY.LONG,
    });
  },
  
  /**
   * Search users
   */
  searchUsers: async (query: string) => {
    return cachedFetch(`/api/get-all-users?search=${encodeURIComponent(query)}`, {
      credentials: 'include',
      // Short expiry for search results
      expiry: CACHE_EXPIRY.SHORT,
    });
  },
  
  /**
   * Invalidate all caches
   */
  invalidateCache: () => {
    storage.remove(CACHE_KEYS.CONVERSATIONS);
    storage.remove(CACHE_KEYS.CURRENT_USER);
    
    // Remove all message caches (find all keys starting with messages_)
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEYS.MESSAGES_PREFIX)) {
        storage.remove(key);
      }
    });
  }
};