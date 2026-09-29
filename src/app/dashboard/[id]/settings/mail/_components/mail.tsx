"use client";

import * as React from "react";
import {
  AlertCircle,
  Archive,
  ArchiveX,
  File,
  Inbox,
  MessagesSquare,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Users2,
  Mail as MailIcon,
  Shield,
  FlaskConical,
  Tv,
  Megaphone,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountSwitcher } from "./account-switcher";
import { MailDisplay } from "./mail-display";
import { MailList } from "./mail-list";
import { Nav } from "./nav";
import { useMail } from "./use-mail";

const REAL_ACCOUNTS = [
  {
    label: "unenter.live Support",
    email: "support@unenter.live",
    icon: <MailIcon className="h-4 w-4" />,
  },
  {
    label: "unenter.live Admin",
    email: "admin@unenter.live",
    icon: <Shield className="h-4 w-4" />,
  },
  {
    label: "Unenter Labs",
    email: "labs@unenter.live",
    icon: <FlaskConical className="h-4 w-4" />,
  },
  {
    label: "Tank Relay",
    email: "tank@unenter.live",
    icon: <Tv className="h-4 w-4" />,
  },
  {
    label: "unenter.live Marketing",
    email: "marketing@unenter.live",
    icon: <Megaphone className="h-4 w-4" />,
  },
  {
    label: "unenter.live Shop",
    email: "shop@unenter.live",
    icon: <ShoppingCart className="h-4 w-4" />,
  },
];

interface MailProps {
  accounts?: typeof REAL_ACCOUNTS;
  mails?: any[];
  defaultLayout?: number[];
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export function Mail({
  accounts = REAL_ACCOUNTS,
  defaultLayout = [20, 35, 45],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const { state, setMailbox, setFolder, setSearch } = useMail();

  const folder = state.folder;
  const unreadCount = state.threads.filter((t) => !t.is_read).length;

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        orientation="horizontal"
        className="h-full min-h-[680px] max-h-[min(840px,90vh)] items-stretch"
      >
        <ResizablePanel
          defaultSize={`${defaultLayout[0]}%`}
          collapsedSize={`${navCollapsedSize}%`}
          collapsible={true}
          minSize="15%"
          maxSize="22%"
          className={cn(isCollapsed && "min-w-[50px] transition-all duration-300 ease-in-out")}
        >
          <div
            className={cn(
              "flex items-center justify-center px-2 py-1.5",
              isCollapsed && "px-0"
            )}
          >
            <AccountSwitcher
              isCollapsed={isCollapsed}
              accounts={accounts}
              selectedAccount={state.mailbox}
              onSelectAccount={setMailbox}
            />
          </div>
          <Separator />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: "Inbox",
                label: unreadCount > 0 ? String(unreadCount) : "",
                icon: Inbox,
                variant: folder === "inbox" ? "default" : "ghost",
                onClick: () => setFolder("inbox"),
              },
              {
                title: "Drafts",
                icon: File,
                variant: folder === "drafts" ? "default" : "ghost",
                onClick: () => setFolder("drafts"),
              },
              {
                title: "Sent",
                icon: Send,
                variant: folder === "sent" ? "default" : "ghost",
                onClick: () => setFolder("sent"),
              },
              {
                title: "Junk",
                icon: ArchiveX,
                variant: folder === "junk" ? "default" : "ghost",
                onClick: () => setFolder("junk"),
              },
              {
                title: "Trash",
                icon: Trash2,
                variant: folder === "trash" ? "default" : "ghost",
                onClick: () => setFolder("trash"),
              },
              {
                title: "Archive",
                icon: Archive,
                variant: folder === "archive" ? "default" : "ghost",
                onClick: () => setFolder("archive"),
              },
            ]}
          />
          <Separator />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: "Support",
                icon: Users2,
                variant: "ghost",
                onClick: () => setMailbox("support@unenter.live"),
              },
              {
                title: "Admin Alerts",
                icon: AlertCircle,
                variant: "ghost",
                onClick: () => setMailbox("admin@unenter.live"),
              },
              {
                title: "Labs Inquiries",
                icon: MessagesSquare,
                variant: "ghost",
                onClick: () => setMailbox("labs@unenter.live"),
              },
              {
                title: "Marketing",
                icon: Megaphone,
                variant: "ghost",
                onClick: () => setMailbox("marketing@unenter.live"),
              },
              {
                title: "Shop",
                icon: ShoppingCart,
                variant: "ghost",
                onClick: () => setMailbox("shop@unenter.live"),
              },
            ]}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={`${defaultLayout[1]}%`} minSize="28%">
          <Tabs defaultValue="all" className="flex h-full flex-col">
            <div className="flex items-center px-4 py-1.5">
              <h1 className="text-foreground text-lg font-bold capitalize">{folder}</h1>
              <TabsList className="ml-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">
                  Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 p-3 backdrop-blur">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  placeholder={`Search ${folder}...`}
                  value={state.search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-xs h-9"
                />
              </div>
            </div>
            <TabsContent value="all" className="m-0 min-h-0 flex-1">
              <MailList items={state.threads} />
            </TabsContent>
            <TabsContent value="unread" className="m-0 min-h-0 flex-1">
              <MailList items={state.threads.filter((t) => !t.is_read)} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={`${defaultLayout[2]}%`} minSize="35%">
          <MailDisplay />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
