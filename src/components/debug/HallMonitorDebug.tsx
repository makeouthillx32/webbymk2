// components/debug/HallMonitorDebug.tsx - Debugging component
import { useEffect } from 'react';
import { useHallMonitor } from '@/hooks/useHallMonitor';

interface HallMonitorDebugProps {
  userId?: string;
  showInConsole?: boolean;
  showOnScreen?: boolean;
}

export default function HallMonitorDebug({ 
  userId, 
  showInConsole = true, 
  showOnScreen = false 
}: HallMonitorDebugProps) {
  const {
    monitor,
    user,
    contentConfig,
    isLoading,
    error,
    hasFeature,
    hasSpecialization
  } = useHallMonitor(userId);

  // Debug logging
  useEffect(() => {
    if (showInConsole) {
      console.log('🐛 [HallMonitorDebug] State changed:', {
        userId,
        hasUser: !!user,
        userRoleId: user?.role_id,
        userRoleName: user?.role_name,
        hasMonitor: !!monitor,
        monitorRole: monitor?.role_name,
        hasContentConfig: !!contentConfig,
        dashboardLayout: contentConfig?.dashboardLayout,
        featuresCount: contentConfig?.availableFeatures?.length || 0,
        isLoading,
        error,
        timestamp: new Date().toISOString()
      });
    }
  }, [monitor, user, contentConfig, isLoading, error, userId, showInConsole]);

  if (!showOnScreen) return null;

  return (
    <div className="fixed top-4 right-4 bg-black text-white p-4 rounded text-xs max-w-md z-50">
      <div className="font-bold mb-2">Hall Monitor Debug</div>
      <div>UserId: {userId || 'None'}</div>
      <div>Loading: {isLoading ? '🔄' : '✅'}</div>
      <div>Error: {error || 'None'}</div>
      <div>User: {user ? `${user.role_name} (${user.role_id})` : 'None'}</div>
      <div>Monitor: {monitor?.role_name || 'None'}</div>
      <div>Config: {contentConfig ? contentConfig.dashboardLayout : 'None'}</div>
      {contentConfig && (
        <>
          <div>Features: {contentConfig.availableFeatures.length}</div>
          <div>Permissions: {contentConfig.permissions.length}</div>
        </>
      )}
      {user?.specializations && user.specializations.length > 0 && (
        <div>Specializations: {user.specializations.map(s => s.name).join(', ')}</div>
      )}
    </div>
  );
}