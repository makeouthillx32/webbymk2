"use client";

import { addDays, addHours, format, nextSaturday } from "date-fns";
import {
  Archive,
  ArchiveX,
  Clock,
  Forward,
  MoreVertical,
  Reply,
  ReplyAll,
  Trash2,
  Send,
  Loader2,
} from "lucide-react";

import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMail, MailThread } from "./use-mail";
import { useState } from "react";

interface MailDisplayProps {
  mail?: any | null;
}

export function MailDisplay({ mail: fallbackMail }: MailDisplayProps) {
  const { state, activeThread, sendReply, moveToFolder } = useMail();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [replyText, setReplyText] = useState("");

  const thread = activeThread || fallbackMail;
  const messages = state.activeMessages.length > 0
    ? state.activeMessages
    : fallbackMail
      ? [
          {
            id: fallbackMail.id,
            from_name: fallbackMail.name,
            from_email: fallbackMail.email,
            subject: fallbackMail.subject,
            body_text: fallbackMail.text,
            created_at: fallbackMail.date,
            is_outgoing: false,
          },
        ]
      : [];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || state.sending) return;
    const ok = await sendReply(replyText);
    if (ok) {
      setReplyText("");
    }
  };

  const participantName = thread?.participant_names?.[0] || thread?.name || "Participant";
  const participantEmail = thread?.participant_emails?.[0] || thread?.email || "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            disabled={!thread}
            title="Archive"
            onClick={() => moveToFolder("archive")}
          >
            <Archive className="h-4 w-4" />
            <span className="sr-only">Archive</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!thread}
            title="Move to junk"
            onClick={() => moveToFolder("junk")}
          >
            <ArchiveX className="h-4 w-4" />
            <span className="sr-only">Move to junk</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={!thread}
            title="Move to trash"
            onClick={() => moveToFolder("trash")}
            className="text-destructive hover:text-destructive focus-visible:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Move to trash</span>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!thread} title="Snooze">
                <Clock className="h-4 w-4" />
                <span className="sr-only">Snooze</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="flex w-auto p-0">
              <div className="flex flex-col gap-2 border-r px-2 py-4">
                <div className="px-4 text-sm font-medium">Snooze until</div>
                <div className="grid min-w-[250px] gap-1">
                  <Button variant="ghost" className="justify-start font-normal">
                    Later today{" "}
                    <span className="text-muted-foreground ml-auto">
                      {format(addHours(selectedDate, 4), "E, h:mm b")}
                    </span>
                  </Button>
                  <Button variant="ghost" className="justify-start font-normal">
                    Tomorrow
                    <span className="text-muted-foreground ml-auto">
                      {format(addDays(selectedDate, 1), "E, h:mm b")}
                    </span>
                  </Button>
                  <Button variant="ghost" className="justify-start font-normal">
                    This weekend
                    <span className="text-muted-foreground ml-auto">
                      {format(nextSaturday(selectedDate), "E, h:mm b")}
                    </span>
                  </Button>
                  <Button variant="ghost" className="justify-start font-normal">
                    Next week
                    <span className="text-muted-foreground ml-auto">
                      {format(addDays(selectedDate, 7), "E, h:mm b")}
                    </span>
                  </Button>
                </div>
              </div>
              <div className="p-2">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  classNames={{ today: "bg-none" }}
                  required
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" disabled={!thread} title="Reply">
            <Reply className="h-4 w-4" />
            <span className="sr-only">Reply</span>
          </Button>
          <Button variant="ghost" size="icon" disabled={!thread} title="Reply all">
            <ReplyAll className="h-4 w-4" />
            <span className="sr-only">Reply all</span>
          </Button>
          <Button variant="ghost" size="icon" disabled={!thread} title="Forward">
            <Forward className="h-4 w-4" />
            <span className="sr-only">Forward</span>
          </Button>
        </div>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={!thread}>
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => moveToFolder("inbox")}>Move to inbox</DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveToFolder("archive")}>Archive</DropdownMenuItem>
            <DropdownMenuItem onClick={() => moveToFolder("trash")}>Move to trash</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />

      {thread ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="flex items-start justify-between border-b pb-3">
                <div className="grid gap-1">
                  <h2 className="text-lg font-bold">{thread.subject}</h2>
                  <div className="text-xs text-muted-foreground">
                    Mailbox: <span className="font-medium text-foreground">{thread.mailbox || state.mailbox}</span>
                  </div>
                </div>
              </div>

              {state.loadingMessages ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading messages...
                </div>
              ) : (
                messages.map((msg: any) => {
                  const isOutgoing = msg.is_outgoing;
                  const dateStr = msg.created_at || msg.date;

                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-4 transition-all ${
                        isOutgoing ? "bg-muted/40 border-primary/20" : "bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarImage alt={msg.from_name || "User"} />
                          <AvatarFallback>
                            {(msg.from_name || "U")
                              .split(" ")
                              .map((c: string) => c[0])
                              .join("")
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid gap-0.5 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{msg.from_name || msg.from_email}</span>
                            {isOutgoing && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                Sent via Brevo
                              </span>
                            )}
                            {dateStr && (
                              <span className="ml-auto text-xs text-muted-foreground">
                                {format(new Date(dateStr), "PPpp")}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {isOutgoing ? `To: ${msg.to_emails?.join(", ")}` : `From: ${msg.from_email}`}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm whitespace-pre-wrap text-foreground">
                        {msg.body_text || msg.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>

          <Separator />
          <div className="p-4 bg-background">
            <form onSubmit={handleSend}>
              <div className="grid gap-3">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="p-3 text-sm resize-none"
                  rows={3}
                  placeholder={`Reply as ${state.mailbox}...`}
                  disabled={state.sending}
                />
                <div className="flex items-center justify-between">
                  <Label htmlFor="mute" className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <Switch id="mute" aria-label="Mute thread" /> Mute this thread
                  </Label>
                  <Button type="submit" size="sm" disabled={state.sending || !replyText.trim()}>
                    {state.sending ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> Send
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground p-8 text-center flex-1 flex items-center justify-center">
          No conversation selected
        </div>
      )}
    </div>
  );
}
