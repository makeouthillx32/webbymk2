"use client";

import { Calendar, ChartLine, Home, Inbox, Bolt, SatelliteDish, House } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Suspense } from "react";

export function AppSidebar() {
  return (
    <Suspense>
      <ClientComponent />
    </Suspense>
  );
}

function ClientComponent() {
  const searchParams = useSearchParams();
  const uuid = searchParams?.get("uuid") ?? "error";

  // Analytics items
  const items = [
    { title: "General",   url: `/dashboard?uuid=${uuid}`,         icon: Home },
    { title: "Messages",  url: `/dashboard/messages?uuid=${uuid}`, icon: Inbox },
    { title: "Activity",  url: `/dashboard/activity?uuid=${uuid}`, icon: ChartLine },
  ];

  // Cially items
  const ciallyItems = [
    { title: "Home",     url: `/`,                icon: House },
    { title: "Settings", url: `/cially/settings`, icon: Bolt },
    { title: "Status",   url: `/cially/status`,   icon: SatelliteDish },
  ];

  return (
    <Sidebar className="rounded-[var(--radius)] border border-[hsl(var(--sidebar-border))]/0 bg-[hsl(var(--sidebar))]/4 backdrop-blur-md">
      <SidebarHeader>
        <a href="/">
          <img src="/logo-png.png" className="w-20 place-self-center" alt="Logo" />
        </a>
        <hr className="border-[hsl(var(--sidebar-border))]" />
      </SidebarHeader>
      <SidebarContent>
        <div className="mb-8">
          <SidebarGroupLabel className="ml-1 text-[hsl(var(--sidebar-foreground))]">Server Analytics</SidebarGroupLabel>
          <SidebarGroupContent className="ml-3 w-50">
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem
                  key={item.title}
                  className="rounded-[calc(var(--radius)*0.25)] from-[hsl(var(--sidebar-accent))]/0 to-[hsl(var(--sidebar-accent))]/10 transition-all hover:bg-gradient-to-r"
                >
                  <SidebarMenuButton asChild>
                    <a href={item.url} className="text-[hsl(var(--sidebar-foreground))]">
                      <item.icon className="text-[hsl(var(--sidebar-primary))]" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </div>

        <SidebarGroupLabel className="ml-1 text-[hsl(var(--sidebar-foreground))]">Dashboard</SidebarGroupLabel>
        <SidebarGroupContent className="ml-3 w-50">
          <SidebarMenu>
            {ciallyItems.map((item) => (
              <SidebarMenuItem
                key={item.title}
                className="rounded-[calc(var(--radius)*0.25)] from-[hsl(var(--sidebar-accent))]/0 to-[hsl(var(--sidebar-accent))]/10 transition-all hover:bg-gradient-to-r"
              >
                <SidebarMenuButton asChild>
                  <a href={item.url} className="text-[hsl(var(--sidebar-foreground))]">
                    <item.icon className="text-[hsl(var(--sidebar-primary))]" />
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarContent>
      <SidebarFooter className="place-items-center">
        <a href="https://github.com/makeouthillx32/schedual">
          <Badge variant="secondary">Version: 0.2.0</Badge>
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}