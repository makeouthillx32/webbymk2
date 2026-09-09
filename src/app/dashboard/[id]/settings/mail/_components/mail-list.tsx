"use client";

import { ComponentProps } from "react";
import { formatDistanceToNow } from "date-fns";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MailThread, useMail } from "./use-mail";

interface MailListProps {
  items: (MailThread | any)[];
}

export function MailList({ items }: MailListProps) {
  const { state, selectThread } = useMail();

  if (items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No messages found in this folder
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.map((item) => {
          const isSelected = state.selectedThreadId === item.id;
          const participant = item.participant_names?.[0] || item.name || item.mailbox || "Unknown";
          const snippet = item.snippet || item.text || "";
          const dateVal = item.last_message_at || item.date || new Date().toISOString();
          const isRead = item.is_read !== undefined ? item.is_read : item.read;
          const labels = item.labels || [];

          return (
            <button
              key={item.id}
              className={cn(
                "hover:bg-accent hover:text-accent-foreground flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all",
                isSelected && "bg-muted"
              )}
              onClick={() => selectThread(item.id)}
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{participant}</div>
                    {!isRead && <span className="flex h-2 w-2 rounded-full bg-blue-600" />}
                  </div>
                  <div
                    className={cn(
                      "ml-auto text-xs",
                      isSelected ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {formatDistanceToNow(new Date(dateVal), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
                <div className="text-xs font-medium">{item.subject}</div>
              </div>
              <div className="text-muted-foreground line-clamp-2 text-xs">
                {snippet.substring(0, 300)}
              </div>
              {labels.length ? (
                <div className="flex items-center gap-2">
                  {labels.map((label: string) => (
                    <Badge key={label} variant={getBadgeVariantFromLabel(label)}>
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function getBadgeVariantFromLabel(label: string): ComponentProps<typeof Badge>["variant"] {
  if (["work"].includes(label.toLowerCase())) {
    return "default";
  }

  if (["personal"].includes(label.toLowerCase())) {
    return "outline";
  }

  return "secondary";
}
