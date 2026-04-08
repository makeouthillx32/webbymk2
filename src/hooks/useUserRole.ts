// hooks/useUserRole.ts
"use client";

import { useState, useEffect } from 'react';

// Role mapping based on the database structure
const ROLE_MAP: {[key: string]: string} = {
  'admin1': 'admin',
  'coachx7': 'jobcoach',
  'user0x': 'user',
  'client7x': 'client'
};

export function useUserRole(userId?: string) {
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when userId changes
    setRole(null);
    setError(null);

    // Only fetch if userId is provided
    if (!userId) return;

    const fetchUserRole = async () => {
      setIsLoading(true);

      try {
        // Fetch profile to get role ID
        const profileResponse = await fetch(`/api/profile/${userId}`);
        
        if (!profileResponse.ok) {
          const errorText = await profileResponse.text();
          console.error('Profile fetch error:', errorText);
          throw new Error('Failed to fetch user profile');
        }

        const profileData = await profileResponse.json();
        
        // Use the role mapping directly
        const roleId = profileData.role;
        const humanReadableRole = ROLE_MAP[roleId] || roleId;
        
        setRole(humanReadableRole);
      } catch (err) {
        console.error('Error fetching role:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user role');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRole();
  }, [userId]);

  return {
    role,
    isLoading,
    error
  };
}