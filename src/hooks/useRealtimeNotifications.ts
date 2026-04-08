// hooks/useRealtimeNotifications.ts
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

interface NotificationItem {
  id: string;
  image_url: string | null;
  title: string;
  content: string | null;
  action_url: string | null;
  created_at: string;
  read?: boolean;
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [newNotificationCount, setNewNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Initial fetch
      try {
        const res = await fetch('/api/notifications', { credentials: 'include' });
        if (res.ok) {
          const { notifications } = await res.json();
          setNotifications(notifications ?? []);
          setNewNotificationCount(notifications?.length ?? 0);
        }
      } catch (e) {
        console.error('Failed to fetch notifications:', e);
      } finally {
        setLoading(false);
      }

      // Realtime subscription (no server-side filter → filter in callback)
      channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          payload => {
            const note = payload.new as NotificationItem & {
              receiver_id: string;
              role_admin: boolean;
              role_jobcoach: boolean;
              role_client: boolean;
              role_user: boolean;
            };

            const isForMe =
              note.receiver_id === user.id ||
              note.role_admin ||
              note.role_jobcoach ||
              note.role_client ||
              note.role_user;

            if (!isForMe) return;

            setNotifications(prev => [note, ...prev]);
            setNewNotificationCount(prev => prev + 1);
          }
        )
        .subscribe();
    };

    init();

    return () => {
      channel?.unsubscribe();
    };
  }, []);

  const markAsRead = () => setNewNotificationCount(0);

  const markNotificationsAsRead = async (ids: string[]) => {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: ids }),
        credentials: 'include',
      });
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.id) ? { ...n, read: true } : n))
      );
      setNewNotificationCount(0);
    } catch (e) {
      console.error('Error marking notifications as read:', e);
    }
  };

  return {
    notifications,
    newNotificationCount,
    loading,
    markAsRead,
    markNotificationsAsRead,
  };
}
