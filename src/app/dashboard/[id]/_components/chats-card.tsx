'use client';

import Image from "next/image";
import { cn } from "@/lib/utils";
import { formatMessageTime } from "@/lib/format-message-time";
import { DotIcon } from "@/assets/icons";
import { getChatsData, ConversationSummary } from "./fetch";
import { useSelectConversation } from "@/hooks/useSelectConversation";
import { useEffect, useState } from "react";

export default function ChatsCard() {
  const [data, setData] = useState<ConversationSummary[]>([]);
  const { openConversation } = useSelectConversation();

  useEffect(() => {
    getChatsData().then(setData);
  }, []);

  const handleChatClick = (chat: ConversationSummary) => {
    openConversation(chat.channel_id);
  };

  return (
    <div className="col-span-12 rounded-[var(--radius)] bg-[hsl(var(--background))] py-6 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)] xl:col-span-4">
      <h2 className="mb-5.5 px-7.5 text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
        Chats
      </h2>

      <ul>
        {data.map((chat) => (
          <li key={chat.channel_id}>
            <button
              onClick={() => handleChatClick(chat)}
              className="w-full flex items-center gap-4.5 px-7.5 py-3 outline-none hover:bg-[hsl(var(--muted))] focus-visible:bg-[hsl(var(--muted))] dark:hover:bg-[hsl(var(--secondary))] dark:focus-visible:bg-[hsl(var(--secondary))] text-left"
            >
              <div className="relative shrink-0">
                <Image
                  src={chat.participants[0]?.avatar_url || "/default-avatar.png"}
                  width={56}
                  height={56}
                  className="size-14 rounded-full object-cover"
                  alt={chat.channel_name}
                />
                <span
                  className={cn(
                    "absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-[hsl(var(--background))] dark:ring-[hsl(var(--card))]",
                    chat.unread_count > 0 ? "bg-[hsl(var(--destructive))]" : "bg-[hsl(var(--muted-foreground))]"
                  )}
                />
              </div>

              <div className="relative flex-grow">
                <h3 className="font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
                  {chat.channel_name}
                </h3>

                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm font-medium text-[hsl(var(--muted-foreground))] xl:max-w-[8rem]",
                      chat.unread_count > 0 && "text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]"
                    )}
                  >
                    {chat.last_message_content}
                  </span>

                  <DotIcon />

                  <time
                    className="text-xs text-[hsl(var(--muted-foreground))]"
                    dateTime={chat.last_message_at}
                  >
                    {formatMessageTime(chat.last_message_at)}
                  </time>
                </div>

                {chat.unread_count > 0 && (
                  <div className="pointer-events-none absolute right-0 top-1/2 aspect-square max-w-fit -translate-y-1/2 select-none rounded-full bg-[hsl(var(--sidebar-primary))] px-2 py-0.5 text-sm font-medium text-[hsl(var(--sidebar-primary-foreground))]">
                    {chat.unread_count}
                  </div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}