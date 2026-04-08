-- 0️⃣ Drop any existing messaging tables (in correct dependency order)
DROP TABLE IF EXISTS message_reactions;
DROP TABLE IF EXISTS message_read_status;
DROP TABLE IF EXISTS message_attachments;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS channel_participants;
DROP TABLE IF EXISTS channel_types;
DROP TABLE IF EXISTS channels;

-- 1️⃣ Create channel types: differentiate between group chats, 1:1 DMs, etc.
CREATE TABLE channel_types (
  id          SMALLINT     PRIMARY KEY,
  name        TEXT         NOT NULL UNIQUE,
  description TEXT         NOT NULL
);

-- Insert standard channel types
INSERT INTO channel_types (id, name, description) VALUES
  (1, 'direct', 'One-to-one private messaging'),
  (2, 'group', 'Group chat with multiple participants'),
  (3, 'broadcast', 'One-to-many announcement channel');

-- 2️⃣ Create channels with enhanced metadata
CREATE TABLE channels (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id       SMALLINT     NOT NULL REFERENCES channel_types(id),
  name          TEXT,                                          -- Optional for direct messages
  description   TEXT,                                          -- Channel description/purpose
  creator_id    UUID         NOT NULL REFERENCES profiles(id),  -- Who created this channel
  is_encrypted  BOOLEAN      NOT NULL DEFAULT false,           -- End-to-end encryption flag
  is_private    BOOLEAN      NOT NULL DEFAULT true,            -- Public vs private visibility
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Ensure direct messages don't have names
  CONSTRAINT direct_channel_no_name CHECK (
    (type_id != 1) OR (type_id = 1 AND name IS NULL)
  )
);

-- 3️⃣ Create participants with enhanced roles and permissions
CREATE TABLE channel_participants (
  channel_id    UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id       UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          TEXT         NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_muted      BOOLEAN      NOT NULL DEFAULT false,            -- User muted notifications
  joined_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_read_at  TIMESTAMPTZ,                                    -- Last time user viewed channel
  PRIMARY KEY (channel_id, user_id)
);

-- 4️⃣ Create messages with enhanced metadata
CREATE TABLE messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID         NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id       UUID         NOT NULL REFERENCES profiles(id),
  reply_to_id     UUID         REFERENCES messages(id),           -- For threaded replies
  content         TEXT,                                          -- Can be NULL if only attachments
  is_edited       BOOLEAN      NOT NULL DEFAULT false,
  is_system       BOOLEAN      NOT NULL DEFAULT false,           -- System generated messages
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  edited_at       TIMESTAMPTZ,
  -- Ensure message has either content or will have attachments
  CONSTRAINT message_has_content CHECK (content IS NOT NULL OR is_system = true)
);

-- 5️⃣ Create message attachments - separate table for better organization
CREATE TABLE message_attachments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_url        TEXT         NOT NULL,
  file_type       TEXT         NOT NULL,                         -- MIME type
  file_name       TEXT         NOT NULL,
  file_size       INTEGER      NOT NULL,                         -- Size in bytes
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 6️⃣ Create message read status - track who has read each message
CREATE TABLE message_read_status (
  message_id      UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- 7️⃣ Create message reactions - emoji reactions to messages
CREATE TABLE message_reactions (
  message_id      UUID         NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction        TEXT         NOT NULL,                         -- Emoji or reaction code
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, reaction)
);

-- 8️⃣ Create indexes for performance
CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_reply_to_id ON messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_channel_participants_user_id ON channel_participants(user_id);
CREATE INDEX idx_message_read_status_user_id ON message_read_status(user_id);
CREATE INDEX idx_message_attachments_message_id ON message_attachments(message_id);

-- 9️⃣ Enable Row Level Security on all tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- 🔟 Create functions for direct message channels
CREATE OR REPLACE FUNCTION create_direct_channel(user1_id UUID, user2_id UUID)
RETURNS UUID AS $$
DECLARE
  new_channel_id UUID;
  existing_channel_id UUID;
BEGIN
  -- Check if a direct channel already exists between these users
  SELECT c.id INTO existing_channel_id
  FROM channels c
  JOIN channel_participants cp1 ON c.id = cp1.channel_id AND cp1.user_id = user1_id
  JOIN channel_participants cp2 ON c.id = cp2.channel_id AND cp2.user_id = user2_id
  WHERE c.type_id = 1 -- direct message type
  LIMIT 1;
  
  -- Return existing channel if found
  IF existing_channel_id IS NOT NULL THEN
    RETURN existing_channel_id;
  END IF;
  
  -- Create new direct channel
  INSERT INTO channels (type_id, creator_id, is_private)
  VALUES (1, user1_id, true)
  RETURNING id INTO new_channel_id;
  
  -- Add both users as participants
  INSERT INTO channel_participants (channel_id, user_id, role) VALUES
    (new_channel_id, user1_id, 'owner'),
    (new_channel_id, user2_id, 'member');
    
  RETURN new_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 🔐 Create RLS policies for channels

-- Only let participants see channels they're in
CREATE POLICY "channels: select for participants"
  ON channels
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM channel_participants cp
    WHERE cp.channel_id = channels.id
      AND cp.user_id = auth.uid()
  ));

-- Allow users to create channels (system will add them as participants)
CREATE POLICY "channels: insert by authenticated users"
  ON channels
  FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Only owners and admins can update channel details
CREATE POLICY "channels: update by admins and owners"
  ON channels
  FOR UPDATE
  USING (EXISTS (
    SELECT 1
    FROM channel_participants cp
    WHERE cp.channel_id = channels.id
      AND cp.user_id = auth.uid()
      AND cp.role IN ('owner', 'admin')
  ));

-- Only channel owners can delete channels
CREATE POLICY "channels: delete by owners"
  ON channels
  FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM channel_participants cp
    WHERE cp.channel_id = channels.id
      AND cp.user_id = auth.uid()
      AND cp.role = 'owner'
  ));

-- 🔐 Create RLS policies for channel participants

-- Users can see participants in channels they belong to
CREATE POLICY "channel_participants: select for members"
  ON channel_participants
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM channel_participants my_membership
    WHERE my_membership.channel_id = channel_participants.channel_id
      AND my_membership.user_id = auth.uid()
  ));

-- Only channel owners and admins can add participants
CREATE POLICY "channel_participants: insert by admins and owners"
  ON channel_participants
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1
    FROM channel_participants cp
    WHERE cp.channel_id = channel_participants.channel_id
      AND cp.user_id = auth.uid()
      AND cp.role IN ('owner', 'admin')
  ) OR auth.uid() = user_id); -- Users can add themselves to public channels

-- Users can update their own membership settings, admins can update anyone
CREATE POLICY "channel_participants: update own or as admin"
  ON channel_participants
  FOR UPDATE
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1
      FROM channel_participants cp
      WHERE cp.channel_id = channel_participants.channel_id
        AND cp.user_id = auth.uid()
        AND cp.role IN ('owner', 'admin')
    )
  );

-- Users can leave channels, admins can remove members, owners can remove anyone except other owners
CREATE POLICY "channel_participants: delete rules"
  ON channel_participants
  FOR DELETE
  USING (
    -- Users can remove themselves
    user_id = auth.uid() OR
    -- Admins can remove members but not other admins/owners
    EXISTS (
      SELECT 1
      FROM channel_participants target, channel_participants me
      WHERE target.channel_id = channel_participants.channel_id
        AND target.user_id = channel_participants.user_id
        AND me.channel_id = channel_participants.channel_id
        AND me.user_id = auth.uid()
        AND me.role = 'admin'
        AND target.role = 'member'
    ) OR
    -- Owners can remove anyone except other owners
    EXISTS (
      SELECT 1
      FROM channel_participants target, channel_participants me
      WHERE target.channel_id = channel_participants.channel_id
        AND target.user_id = channel_participants.user_id
        AND me.channel_id = channel_participants.channel_id
        AND me.user_id = auth.uid()
        AND me.role = 'owner'
        AND target.role != 'owner'
    )
  );

-- 🔐 Create RLS policies for messages

-- Only participants can view messages in their channels
CREATE POLICY "messages: select for participants"
  ON messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM channel_participants cp
    WHERE cp.channel_id = messages.channel_id
      AND cp.user_id = auth.uid()
  ));

-- Only participants can send messages
CREATE POLICY "messages: insert for participants"
  ON messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1
      FROM channel_participants cp
      WHERE cp.channel_id = messages.channel_id
        AND cp.user_id = auth.uid()
    )
  );

-- Users can edit only their own messages
CREATE POLICY "messages: update own messages"
  ON messages
  FOR UPDATE
  USING (sender_id = auth.uid());

-- Users can delete only their own messages, admins can delete any message
CREATE POLICY "messages: delete own or as admin"
  ON messages
  FOR DELETE
  USING (
    sender_id = auth.uid() OR
    EXISTS (
      SELECT 1
      FROM channel_participants cp
      WHERE cp.channel_id = messages.channel_id
        AND cp.user_id = auth.uid()
        AND cp.role IN ('owner', 'admin')
    )
  );

-- 🔐 Create RLS policies for message attachments
CREATE POLICY "message_attachments: select for participants"
  ON message_attachments
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM messages m
    JOIN channel_participants cp ON m.channel_id = cp.channel_id
    WHERE m.id = message_attachments.message_id
      AND cp.user_id = auth.uid()
  ));

CREATE POLICY "message_attachments: insert for message owner"
  ON message_attachments
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.id = message_attachments.message_id
      AND m.sender_id = auth.uid()
  ));

CREATE POLICY "message_attachments: delete for message owner or admins"
  ON message_attachments
  FOR DELETE
  USING (EXISTS (
    SELECT 1
    FROM messages m
    LEFT JOIN channel_participants cp ON m.channel_id = cp.channel_id AND cp.user_id = auth.uid()
    WHERE m.id = message_attachments.message_id
      AND (m.sender_id = auth.uid() OR cp.role IN ('owner', 'admin'))
  ));

-- 🔐 Create RLS policies for message read status
CREATE POLICY "message_read_status: select for participants"
  ON message_read_status
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM messages m
    JOIN channel_participants cp ON m.channel_id = cp.channel_id
    WHERE m.id = message_read_status.message_id
      AND cp.user_id = auth.uid()
  ));

CREATE POLICY "message_read_status: insert own status"
  ON message_read_status
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1
      FROM messages m
      JOIN channel_participants cp ON m.channel_id = cp.channel_id
      WHERE m.id = message_read_status.message_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "message_read_status: update own status"
  ON message_read_status
  FOR UPDATE
  USING (user_id = auth.uid());

-- 🔐 Create RLS policies for message reactions
CREATE POLICY "message_reactions: select for participants"
  ON message_reactions
  FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM messages m
    JOIN channel_participants cp ON m.channel_id = cp.channel_id
    WHERE m.id = message_reactions.message_id
      AND cp.user_id = auth.uid()
  ));

CREATE POLICY "message_reactions: insert own reactions"
  ON message_reactions
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1
      FROM messages m
      JOIN channel_participants cp ON m.channel_id = cp.channel_id
      WHERE m.id = message_reactions.message_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "message_reactions: delete own reactions"
  ON message_reactions
  FOR DELETE
  USING (user_id = auth.uid());

-- 📋 Create useful view for unread message counts
CREATE OR REPLACE VIEW user_unread_messages AS
SELECT 
  cp.user_id,
  cp.channel_id,
  c.name AS channel_name,
  COUNT(m.id) AS unread_count,
  MAX(m.created_at) AS latest_message_time
FROM 
  channel_participants cp
JOIN 
  channels c ON cp.channel_id = c.id
LEFT JOIN 
  messages m ON cp.channel_id = m.channel_id
LEFT JOIN 
  message_read_status mrs ON m.id = mrs.message_id AND mrs.user_id = cp.user_id
WHERE 
  (m.created_at > cp.last_read_at OR cp.last_read_at IS NULL) 
  AND mrs.read_at IS NULL
  AND m.sender_id != cp.user_id  -- Don't count own messages as unread
GROUP BY 
  cp.user_id, cp.channel_id, c.name;