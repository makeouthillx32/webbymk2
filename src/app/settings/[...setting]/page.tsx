// app/settings/[...setting]/page.tsx
import { RedirectType, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import dynamic from "next/dynamic";
import type { FC } from "react";
import { Settings, User, ShoppingCart, Calendar, Clock, CreditCard } from "lucide-react";
import { SettingsToast } from "@/components/settings/SettingsToast";

type DynComp = FC<{}>;

const settingsMap: Record<string, DynComp> = {
  // Add default root component
  "": dynamic(() => import("@/components/settings/profile-settings")) as DynComp,
};

// Map settings to icons
const settingIcons: Record<string, JSX.Element> = {
  "": <User size={20} />,
  profile: <User size={20} />,
  catalog: <ShoppingCart size={20} />,
  CMS: <Calendar size={20} />,
  "CMS/schedule": <Calendar size={20} />,
  
  // Tools icons - only for existing tools
  "Tools/timesheet-calculator": <Clock size={20} />,
  "Tools/punch-card-maker": <CreditCard size={20} />,
};

interface SettingsPageProps {
  params: Promise<{ setting?: string[] }>;
  searchParams?: Promise<{ 
    toast?: string; 
    message?: string; 
    userRole?: string; 
  }>;
}

export default async function SettingsPage(props: SettingsPageProps) {
  const { setting = [] } = await props.params;
  const searchParams = await props.searchParams;
  const settingPath = setting.join("/");

  // Check if we have toast parameters from middleware redirect
  if (searchParams?.toast && searchParams?.message) {
    const toastType = searchParams.toast === 'auth-required' ? 'auth' : 'role';
    const redirectTo = searchParams.toast === 'auth-required' ? '/sign-in' : '/dashboard';
    
    return (
      <SettingsToast 
        type={toastType}
        message={searchParams.message}
        userRole={searchParams.userRole}
        redirectTo={redirectTo}
      />
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // not needed here
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Simple auth check - redirect to sign-in if no session
  if (!session) {
    const target = "/settings/" + settingPath;
    redirect(`/sign-in?redirect_to=${encodeURIComponent(target)}`, RedirectType.replace);
  }

  // Handle settings component selection
  const SettingsComponent = settingsMap[settingPath];
  if (!SettingsComponent) {
    redirect("/settings/profile", RedirectType.replace);
  }

  const settingTitle = getSettingTitle(settingPath);
  const settingIcon = settingIcons[settingPath] || <Settings size={20} />;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <div className="p-2 rounded-full bg-[hsl(var(--sidebar-primary))]/10 text-[hsl(var(--sidebar-primary))] mr-3">
            {settingIcon}
          </div>
          <h1 className="text-2xl font-[var(--font-serif)] font-bold text-[hsl(var(--foreground))] leading-[1.2]">
            {settingTitle}
          </h1>
        </div>
        <p className="text-[hsl(var(--muted-foreground))] font-[var(--font-sans)] leading-[1.5]">
          {getSettingDescription(settingPath)}
        </p>
      </div>

      <div className="p-6 rounded-[var(--radius)] shadow-[var(--shadow-md)] bg-[hsl(var(--card))]">
        <SettingsComponent />
      </div>
    </div>
  );
}

// Helper function to generate human-readable setting titles
function getSettingTitle(settingPath: string): string {
  if (!settingPath) return "Account Settings";
  
  const titles: Record<string, string> = {
    profile: "Profile Settings",
    catalog: "Catalog Settings",
    CMS: "CMS Settings",
    "CMS/schedule": "Schedule Settings",
    
    // Tools titles - only for existing tools
    "Tools/timesheet-calculator": "Timesheet Calculator Settings",
    "Tools/punch-card-maker": "Punch Card Maker Settings", 
  };
  
  return titles[settingPath] || "Settings";
}

// Helper function to generate setting descriptions
function getSettingDescription(settingPath: string): string {
  const descriptions: Record<string, string> = {
    "": "Manage your account preferences and personal information",
    profile: "Update your profile information and account preferences",
    catalog: "Manage your product catalog and inventory settings",
    CMS: "Configure your content management system settings",
    "CMS/schedule": "Customize your cleaning schedule and team assignments",
    
    // Tools descriptions - only for existing tools
    "Tools/timesheet-calculator": "Customize timesheet calculation preferences and default settings",
    "Tools/punch-card-maker": "Configure punch card templates, layouts, and printing preferences",
  };
  
  return descriptions[settingPath] || "Manage your settings and preferences";
}