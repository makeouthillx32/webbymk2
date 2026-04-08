-- HELPER FUNCTIONS FOR INTEGRATING WITH YOUR EXISTING SYSTEM

-- Function to send a message with a single query
CREATE OR REPLACE FUNCTION send_message(
  p_channel_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_attachment_url TEXT DEFAULT NULL,
  p_attachment_type TEXT DEFAULT NULL,
  p_attachment_name TEXT DEFAULT NULL,
  p_attachment_size INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  new_message_id UUID;
BEGIN
  -- Insert the message
  INSERT INTO messages (channel_id, sender_id, content)
  VALUES (p_channel_id, p_sender_id, p_content)
  RETURNING id INTO new_message_id;
  
  -- Add attachment if provided
  IF p_attachment_url IS NOT NULL THEN
    INSERT INTO message_attachments (
      message_id, 
      file_url, 
      file_type, 
      file_name, 
      file_size
    )
    VALUES (
      new_message_id, 
      p_attachment_url, 
      COALESCE(p_attachment_type, 'application/octet-stream'), 
      COALESCE(p_attachment_name, 'attachment'), 
      COALESCE(p_attachment_size, 0)
    );
  END IF;
  
  RETURN new_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all messages in a channel as read
CREATE OR REPLACE FUNCTION mark_channel_as_read(
  p_channel_id UUID,
  p_user_id UUID
) RETURNS VOID AS $$
BEGIN
  -- Update last_read_at timestamp for the user in this channel
  UPDATE channel_participants
  SET last_read_at = now()
  WHERE channel_id = p_channel_id AND user_id = p_user_id;
  
  -- Insert read status for any unread messages
  INSERT INTO message_read_status (message_id, user_id)
  SELECT m.id, p_user_id
  FROM messages m
  LEFT JOIN message_read_status mrs 
    ON m.id = mrs.message_id AND mrs.user_id = p_user_id
  WHERE m.channel_id = p_channel_id
    AND mrs.message_id IS NULL
    AND m.sender_id != p_user_id
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent conversations for a user
CREATE OR REPLACE FUNCTION get_user_conversations(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  channel_id UUID,
  channel_name TEXT,
  channel_type SMALLINT,
  is_group BOOLEAN,
  last_message_content TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT,
  participants JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH user_channels AS (
    SELECT 
      cp.channel_id
    FROM 
      channel_participants cp
    WHERE 
      cp.user_id = p_user_id
  ),
  last_messages AS (
    SELECT DISTINCT ON (m.channel_id)
      m.channel_id,
      m.content as last_message_content,
      m.created_at as last_message_at
    FROM 
      messages m
    JOIN 
      user_channels uc ON m.channel_id = uc.channel_id
    ORDER BY 
      m.channel_id, m.created_at DESC
  ),
  unread_counts AS (
    SELECT 
      um.channel_id,
      um.unread_count
    FROM 
      user_unread_messages um
    WHERE 
      um.user_id = p_user_id
  ),
  channel_participants_json AS (
    SELECT 
      cp.channel_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id', p.id,
          'role', cp.role,
          'avatar_url', p.avatar_url
        )
      ) AS participants
    FROM 
      channel_participants cp
    JOIN 
      profiles p ON cp.user_id = p.id
    JOIN 
      user_channels uc ON cp.channel_id = uc.channel_id
    GROUP BY 
      cp.channel_id
  )
  SELECT 
    c.id AS channel_id,
    c.name AS channel_name,
    c.type_id AS channel_type,
    c.type_id != 1 AS is_group, -- Not a direct message = group
    lm.last_message_content,
    lm.last_message_at,
    COALESCE(uc.unread_count, 0) AS unread_count,
    COALESCE(cpj.participants, '[]'::jsonb) AS participants
  FROM 
    channels c
  JOIN 
    user_channels uc2 ON c.id = uc2.channel_id
  LEFT JOIN 
    last_messages lm ON c.id = lm.channel_id
  LEFT JOIN 
    unread_counts uc ON c.id = uc.channel_id
  LEFT JOIN 
    channel_participants_json cpj ON c.id = cpj.channel_id
  ORDER BY 
    lm.last_message_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to find or create a direct message between two users
CREATE OR REPLACE FUNCTION find_or_create_dm(
  p_user1_id UUID,
  p_user2_id UUID
) RETURNS TABLE (
  channel_id UUID,
  created BOOLEAN
) AS $$
DECLARE
  existing_channel_id UUID;
  new_channel_id UUID;
  created_new BOOLEAN;
BEGIN
  -- First check if a direct channel already exists
  SELECT c.id INTO existing_channel_id
  FROM channels c
  JOIN channel_participants cp1 ON c.id = cp1.channel_id AND cp1.user_id = p_user1_id
  JOIN channel_participants cp2 ON c.id = cp2.channel_id AND cp2.user_id = p_user2_id
  WHERE c.type_id = 1 -- Direct message type
  LIMIT 1;
  
  -- Return existing channel if found
  IF existing_channel_id IS NOT NULL THEN
    channel_id := existing_channel_id;
    created := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- If not found, create new direct channel
  new_channel_id := create_direct_channel(p_user1_id, p_user2_id);
  channel_id := new_channel_id;
  created := TRUE;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get messages for a channel with pagination
CREATE OR REPLACE FUNCTION get_channel_messages(
  p_channel_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_before_id UUID DEFAULT NULL
) RETURNS TABLE (
  message_id UUID,
  content TEXT,
  sender_id UUID,
  sender_avatar_url TEXT,
  sender_role TEXT,
  created_at TIMESTAMPTZ,
  is_edited BOOLEAN,
  replies_count BIGINT,
  reactions JSONB,
  attachments JSONB
) AS $$
BEGIN
  -- Mark channel as read when fetching messages
  PERFORM mark_channel_as_read(p_channel_id, p_user_id);
  
  RETURN QUERY
  WITH message_attachments_json AS (
    SELECT 
      ma.message_id,
      jsonb_agg(
        jsonb_build_object(
          'file_url', ma.file_url,
          'file_type', ma.file_type,
          'file_name', ma.file_name,
          'file_size', ma.file_size
        )
      ) AS attachments
    FROM 
      message_attachments ma
    JOIN 
      messages m ON ma.message_id = m.id
    WHERE 
      m.channel_id = p_channel_id
    GROUP BY 
      ma.message_id
  ),
  message_reactions_json AS (
    SELECT 
      mr.message_id,
      jsonb_agg(
        jsonb_build_object(
          'reaction', mr.reaction,
          'user_id', mr.user_id
        )
      ) AS reactions
    FROM 
      message_reactions mr
    JOIN 
      messages m ON mr.message_id = m.id
    WHERE 
      m.channel_id = p_channel_id
    GROUP BY 
      mr.message_id
  ),
  reply_counts AS (
    SELECT 
      m.reply_to_id,
      COUNT(*) AS reply_count
    FROM 
      messages m
    WHERE 
      m.channel_id = p_channel_id AND
      m.reply_to_id IS NOT NULL
    GROUP BY 
      m.reply_to_id
  )
  SELECT 
    m.id AS message_id,
    m.content,
    m.sender_id,
    p.avatar_url AS sender_avatar_url,
    p.role AS sender_role,
    m.created_at,
    m.is_edited,
    COALESCE(rc.reply_count, 0) AS replies_count,
    COALESCE(mrj.reactions, '[]'::jsonb) AS reactions,
    COALESCE(maj.attachments, '[]'::jsonb) AS attachments
  FROM 
    messages m
  JOIN 
    profiles p ON m.sender_id = p.id
  LEFT JOIN 
    message_attachments_json maj ON m.id = maj.message_id
  LEFT JOIN 
    message_reactions_json mrj ON m.id = mrj.message_id
  LEFT JOIN 
    reply_counts rc ON m.id = rc.reply_to_id
  WHERE 
    m.channel_id = p_channel_id AND
    (p_before_id IS NULL OR m.id < p_before_id)
  ORDER BY 
    m.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

--- USAGE EXAMPLES ---

-- Example 1: Create a direct message channel
SELECT * FROM find_or_create_dm(
  '6db3a2c3-08c2-4426-a408-63895f4324c1', -- admin user
  'f874f41c-2605-4803-ae57-5eadd3abf3d1'  -- coach user
);

-- Example 2: Create a group channel with multiple participants
SELECT create_or_get_group_channel(
  'Project Team Chat',
  '6db3a2c3-08c2-4426-a408-63895f4324c1', -- creator (admin)
  ARRAY[
    'f874f41c-2605-4803-ae57-5eadd3abf3d1',  -- coach
    'c83b1b75-1171-428f-92b7-cb483043b6b4',  -- user
    '8731ad3b-77c7-4cd7-bfe7-85ae740fe91f'   -- another user
  ]
);

-- Example 3: Send a message to a channel
DO $$
DECLARE
  channel_id UUID := '83f05e67-77e2-4f73-a799-29ec6c7af438'; -- replace with actual channel_id
BEGIN
  PERFORM send_message(
    channel_id,
    '6db3a2c3-08c2-4426-a408-63895f4324c1', -- sender_id (admin)
    'Welcome to the team chat! Let me know if you have any questions.',
    'https://chsmesvozsjcgrwuimld.supabase.co/storage/v1/object/public/attachments/welcome.pdf', -- attachment_url
    'application/pdf', -- attachment_type
    'team_welcome.pdf', -- attachment_name
    152400 -- attachment_size in bytes
  );
END $$;

-- Example 4: Get a user's recent conversations
SELECT * FROM get_user_conversations(
  '6db3a2c3-08c2-4426-a408-63895f4324c1', -- user_id
  10 -- limit
);

-- Example 5: Get messages for a specific channel with pagination
SELECT * FROM get_channel_messages(
  '83f05e67-77e2-4f73-a799-29ec6c7af438', -- channel_id
  '6db3a2c3-08c2-4426-a408-63895f4324c1', -- user_id (for marking as read)
  30, -- limit
  NULL -- before_id (for pagination)
);