// components/Layouts/appheader/dropdown-menu.tsx
"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "@/app/provider";
import { usePathname } from "next/navigation";
import useLoginSession from "@/lib/useLoginSession";
import LogoutButton from "@/components/Layouts/app/LogoutButton";
import SignInButton from "@/components/Layouts/app/SignInButton";
import DashboardButton from "@/components/Layouts/app/DashboardButton";
import SettingsButton from "@/components/Layouts/app/SettingsButton";
import ScheduleButton from "@/components/Layouts/app/ScheduleButton";
import HomeButton from "@/components/Layouts/app/HomeButton";
import CurrentDateTime from "@/components/Layouts/app/CurrentDateTime";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          `z-50 min-w-[8rem] overflow-hidden rounded-[var(--radius)] border border-[hsl(var(--border))] p-1 shadow-[var(--shadow-md)] data-[state=open]:animate-in ${
            isDark
              ? "bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]"
              : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          }`,
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    variant?: "default" | "danger";
  }
>(({ className, variant = "default", ...props }, ref) => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const baseStyle = `flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm transition-colors focus:outline-none`;
  const colorStyle =
    variant === "danger"
      ? isDark
        ? "text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
        : "text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
      : isDark
      ? "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] focus:bg-[hsl(var(--accent))]"
      : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] focus:bg-[hsl(var(--accent))]";

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(baseStyle, colorStyle, className)}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const CustomDropdown: React.FC = () => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const session = useLoginSession();

  // Fixed: Get the full path context for settings, not just the first segment
  const getActivePage = (pathname: string): string => {
    // Remove leading slash and split
    const segments = pathname.slice(1).split('/').filter(Boolean);
    
    if (segments.length === 0) return "home";
    
    // For Tools pages, preserve the full path structure
    if (segments[0] === "Tools" && segments.length > 1) {
      return `Tools/${segments[1]}`;
    }
    
    // For CMS pages with sub-paths
    if (segments[0] === "CMS" && segments.length > 1) {
      return `CMS/${segments[1]}`;
    }
    
    // For other pages, return the first segment
    return segments[0];
  };

  const activePage = getActivePage(pathname);
  const handleMenuClick = () => setOpen(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center justify-center w-8 h-8 rounded-md hover:bg-[hsl(var(--accent))] transition-colors duration-200`}
          aria-label="Toggle menu"
        >
          <div className="space-y-1.5">
            <div
              className={`w-6 h-0.5 ${
                isDark ? "bg-[hsl(var(--foreground))]" : "bg-[hsl(var(--foreground))]"
              } transition-colors duration-200`}
            />
            <div
              className={`w-6 h-0.5 ${
                isDark ? "bg-[hsl(var(--foreground))]" : "bg-[hsl(var(--foreground))]"
              } transition-colors duration-200`}
            />
            <div
              className={`w-6 h-0.5 ${
                isDark ? "bg-[hsl(var(--foreground))]" : "bg-[hsl(var(--foreground))]"
              } transition-colors duration-200`}
            />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <div className="p-2 mb-1 border-b border-[hsl(var(--border))]">
          <CurrentDateTime />
        </div>
        <HomeButton onClick={handleMenuClick} />
        <ScheduleButton onClick={handleMenuClick} />
        <SettingsButton activePage={activePage} onClick={handleMenuClick} />
        {session?.user?.id && (
          <DashboardButton onClick={handleMenuClick} />
        )}
        <div className="h-px my-1 bg-[hsl(var(--border))]" />
        {!session && <SignInButton onClick={handleMenuClick} />}
        {session && <LogoutButton />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export {
  CustomDropdown,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
};