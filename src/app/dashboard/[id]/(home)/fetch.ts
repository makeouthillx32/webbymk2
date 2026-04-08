import { createClient } from '@/utils/supabase/server';

export async function getOverviewData() {
  try {
    const usersData = await getUsersData();
    
    return {
      views: {
        value: 0,
        growthRate: 0,
      },
      profit: {
        value: 0,
        growthRate: 0,
      },
      products: {
        value: 0,
        growthRate: 0,
      },
      users: usersData,
    };
  } catch (error) {
    console.error('Error fetching overview data:', error);
    return {
      views: { value: 0, growthRate: 0 },
      profit: { value: 0, growthRate: 0 },
      products: { value: 0, growthRate: 0 },
      users: { value: 0, growthRate: 0 },
    };
  }
}

async function getUsersData() {
  try {
    const supabase = await createClient();
    
    const { count: totalUsers, error: countError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error fetching user count:', countError);
      return { value: 0, growthRate: 0 };
    }

    const now = new Date();
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const { count: thisMonthUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayThisMonth.toISOString());

    const { count: lastMonthUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', firstDayLastMonth.toISOString())
      .lt('created_at', firstDayThisMonth.toISOString());

    let growthRate = 0;
    if (lastMonthUsers && lastMonthUsers > 0) {
      growthRate = ((thisMonthUsers || 0) - lastMonthUsers) / lastMonthUsers;
    } else if (thisMonthUsers && thisMonthUsers > 0) {
      growthRate = 1;
    }

    return {
      value: totalUsers || 0,
      growthRate: Math.round(growthRate * 10000) / 100,
    };
  } catch (error) {
    console.error('Error fetching users data:', error);
    return { value: 0, growthRate: 0 };
  }
}

export async function getChatsData() {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log('No authenticated user found');
      return [];
    }

    const { data, error } = await supabase.rpc('get_user_conversations_with_display_name', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('RPC Error:', error.message);
      return [];
    }

    if (!Array.isArray(data)) {
      console.error('Conversations data is not an array:', data);
      return [];
    }

    const mappedChats = data.map((conv) => {
      let displayName = conv.channel_name || 'Unnamed Chat';
      
      if (!conv.is_group && conv.participants && Array.isArray(conv.participants)) {
        const otherParticipant = conv.participants.find(p => p.user_id !== user.id);
        if (otherParticipant && otherParticipant.display_name) {
          displayName = otherParticipant.display_name;
        }
      }
      
      let profileImage = '/images/user/user-default.png';
      if (conv.is_group) {
        profileImage = '/images/user/group-default.png';
      } else if (conv.participants && Array.isArray(conv.participants)) {
        const otherParticipant = conv.participants.find(p => p.user_id !== user.id);
        if (otherParticipant && otherParticipant.avatar_url) {
          profileImage = otherParticipant.avatar_url;
        }
      }
      
      let isActive = false;
      if (conv.participants && Array.isArray(conv.participants)) {
        isActive = conv.participants.some(p => p.online === true);
      }
      
      const lastMessageContent = conv.last_message_content || conv.last_message || 'No messages yet';
      const lastMessageTime = conv.last_message_at || new Date().toISOString();
      const hasUnread = (conv.unread_count || 0) > 0;
      
      return {
        name: displayName,
        profile: profileImage,
        isActive: isActive,
        lastMessage: {
          content: lastMessageContent,
          type: 'text',
          timestamp: lastMessageTime,
          isRead: !hasUnread,
        },
        unreadCount: conv.unread_count || 0,
      };
    });

    return mappedChats;
    
  } catch (error) {
    console.error('Error fetching chats data:', error);
    return [];
  }
}