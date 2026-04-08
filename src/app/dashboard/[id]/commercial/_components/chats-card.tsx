import { DotIcon } from "@/assets/icons";
import { formatMessageTime } from "@/lib/format-message-time";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { getChatsData } from "../fetch";

export async function ChatsCard() {
  const data = await getChatsData();

  return (
    <div className="col-span-12 rounded-[var(--radius)] bg-[hsl(var(--background))] py-6 shadow-[var(--shadow-sm)] dark:bg-[hsl(var(--card))] dark:shadow-[var(--shadow-md)] xl:col-span-4">
      <h2 className="mb-5.5 px-7.5 text-body-2xlg font-bold text-[hsl(var(--foreground))] dark:text-[hsl(var(--card-foreground))]">
        Chats
      </h2>

      <ul>
        {data.map((chat, key) => (
          <li key={key}>
            <Link
              href="/"
              className="flex items-center gap-4.5 px-7.5 py-3 outline-none hover:bg-[hsl(var(--muted))] focus-visible:bg-[hsl(var(--muted))] dark:hover:bg-[hsl(var(--secondary))] dark:focus-visible:bg-[hsl(var(--secondary))]"
            >
              <div className="relative shrink-0">
                <Image
                  src={chat.profile}
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
                    {chat.unreadCount}
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