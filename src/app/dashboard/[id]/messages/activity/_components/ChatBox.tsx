"use client";

import { useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/app/provider';

export default function ChatBox({ channelId }: { channelId: string }) {
  const { messages, sendMessage } = useChat(channelId);
  const [content, setContent] = useState('');
  const { user } = useAuth();

  const handleSend = () => {
    if (content.trim()) {
      sendMessage(content);
      setContent('');
    }
  };

  return (
    <div className="flex flex-col h-full p-4 bg-card rounded shadow">
      <div className="flex-1 overflow-y-auto mb-2">
        {messages.map(msg => (
          <div key={msg.id} className={`mb-2 ${msg.sender_id === user?.id ? 'text-right' : 'text-left'}`}>
            <div className="inline-block bg-secondary p-2 rounded-lg">
              <span>{msg.content}</span>
              <div className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1"
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button className="bg-primary text-primary-foreground px-4 py-1 rounded" onClick={handleSend}>Send</button>
      </div>
    </div>
  );
}
