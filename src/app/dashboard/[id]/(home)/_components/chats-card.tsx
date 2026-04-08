import { DotIcon } from "@/assets/icons";
import { formatMessageTime } from "@/lib/format-message-time";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { getChatsData } from "../fetch";

export async function ChatsCard() {
  const data = await getChatsData();

  // Chart colors for group chat avatars
  const chartColors = [
    'bg-[hsl(var(--chart-1))]',
    'bg-[hsl(var(--chart-2))]',
    'bg-[hsl(var(--chart-3))]',
    'bg-[hsl(var(--chart-4))]'
  ];

  // Generate deterministic color for group chats based on name
  const getGroupChatColor = (name: string) => {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return chartColors[hash % chartColors.length];
  };

  // Format notification count (9+ for counts over 9)
  const formatNotificationCount = (count: number) => {
    return count > 9 ? '9+' : count.toString();
  };

  // Check if chat has a valid profile picture
  const hasProfilePicture = (profile: string | null | undefined) => {
    return profile && profile.trim() !== '' && !profile.includes('placeholder') && !profile.includes('default');
  };

  return (
    <div className="col-span-12 rounded-[var(--radius)] bg-[hsl(var(--background))] py-6 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)] xl:col-span-4">
      <h2 className="mb-5.5 px-7.5 text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
        Chats
      </h2>

      <ul>
        {data.map((chat, key) => (
          <li key={key}>
            <Link
              href="/dashboard/me/messages"
              className="flex items-center gap-4.5 px-7.5 py-3 outline-none hover:bg-[hsl(var(--muted))] focus-visible:bg-[hsl(var(--muted))] dark:hover:bg-[hsl(var(--secondary))] dark:focus-visible:bg-[hsl(var(--secondary))]"
            >
              <div className="relative shrink-0">
                {hasProfilePicture(chat.profile) ? (
                  // Direct message with profile picture
                  <>
                    <Image
                      src={chat.profile!}
                      width={56}
                      height={56}
                      className="size-14 rounded-full object-cover"
                      alt={"Avatar for " + chat.name}
                    />

                    <span
                      className={cn(
                        "absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-[hsl(var(--background))] dark:ring-[hsl(var(--card))]",
                        chat.isActive ? "bg-[hsl(var(--chart-2))]" : "bg-[hsl(var(--chart-5))]",
                      )}
                    />
                  </>
                ) : (
                  // Group chat with colored avatar and first letter
                  <div className={cn(
                    "size-14 rounded-full flex items-center justify-center text-white font-semibold text-lg shadow-sm",
                    getGroupChatColor(chat.name)
                  )}>
                    {chat.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="relative flex-grow">
                <h3 className="font-medium text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
                  {chat.name}
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm font-medium dark:text-[hsl(var(--muted-foreground))] xl:max-w-[8rem]",
                      chat.unreadCount && "text-[hsl(var(--muted-foreground))] dark:text-[hsl(var(--accent-foreground))]",
                    )}
                  >
                    {chat.lastMessage.content}
                  </span>

                  <DotIcon />

                  <time
                    className="text-xs"
                    dateTime={chat.lastMessage.timestamp}
                  >
                    {formatMessageTime(chat.lastMessage.timestamp)}
                  </time>
                </div>

                {!!chat.unreadCount && (
                  <div className="pointer-events-none absolute right-0 top-1/2 aspect-square max-w-fit -translate-y-1/2 select-none rounded-full bg-[hsl(var(--sidebar-primary))] px-2 py-0.5 text-sm font-medium text-[hsl(var(--sidebar-primary-foreground))]">
                    {formatNotificationCount(chat.unreadCount)}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}