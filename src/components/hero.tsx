"use client";

import { useState, useEffect } from "react";
import { fetchSchedule } from "@/components/fetchSchedule";
import { assignRandomJobs } from "@/components/assignRandomJobs";
import Toast from "@/components/Toast";
import RandomizerButton from "@/components/RandomizerButton";
import WeatherWidget from "@/components/WeatherWidget";
import ScheduleList from "@/components/ScheduleList";
import TeamMembersList from "@/components/TeamMembersList";
import CleanTrack from "@/components/CleanTrack";
import { useTheme } from "@/app/provider";
import { Calendar, CheckCircle2 } from "lucide-react";

interface JobSchedule {
  business_name: string;
  jobs: { job_name: string; member_name: string }[];
  before_open: boolean;
  address: string;
  business_id?: number;
  isCompleted?: boolean;
}

interface Member {
  id: number;
  name: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}

interface CleanTrackItem {
  id?: number;
  business_id: number;
  business_name: string;
  address: string;
  before_open: boolean;
  status: "pending" | "cleaned" | "missed" | "moved";
  cleaned_at?: string;
  moved_to_date?: string;
  notes?: string;
  marked_by?: string;
  updated_at?: string;
}

interface DailyInstance {
  id: number;
  instance_date: string;
  week_number: number;
  day_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Helper function to get local date for Ridgecrest, CA (Pacific Time)
function getLocalDate(): string {
  const now = new Date();
  // Convert to Pacific Time (UTC-8 or UTC-7 depending on DST)
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  const year = pacificTime.getFullYear();
  const month = String(pacificTime.getMonth() + 1).padStart(2, '0');
  const day = String(pacificTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to get local day name for Ridgecrest, CA
function getLocalDayName(): string {
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  return pacificTime.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
}

// Helper function to get local week number for Ridgecrest, CA
function getLocalWeekNumber(): number {
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
  return Math.ceil(pacificTime.getDate() / 7);
}

const Hero = () => {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const [week, setWeek] = useState(0);
  const [day, setDay] = useState("");
  const [schedule, setSchedule] = useState<JobSchedule[]>([]);
  const [membersList, setMembersList] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastInfo, setToastInfo] = useState<{
    business_id?: number;
    business_name: string;
    before_open: boolean;
    address: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "team" | "clean-track">("schedule");
  
  const [currentInstance, setCurrentInstance] = useState<DailyInstance | null>(null);
  const [cleanTrack, setCleanTrack] = useState<CleanTrackItem[]>([]);
  const [instanceLoading, setInstanceLoading] = useState(false);

  useEffect(() => {
    fetch("/api/schedule/members")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load members");
        return res.json() as Promise<Member[]>;
      })
      .then(setMembersList)
      .catch(console.error);
  }, []);

  // Set current day and week using Pacific Time for Ridgecrest, CA
  useEffect(() => {
    setDay(getLocalDayName());
    setWeek(getLocalWeekNumber());
    console.log("🌎 Local time for Ridgecrest, CA:", {
      date: getLocalDate(),
      day: getLocalDayName(),
      week: getLocalWeekNumber()
    });
  }, []);

  const checkForMovedBusinesses = async (dateStr: string) => {
    try {
      const res = await fetch(`/api/schedule/daily-instances/moved?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        return data.movedBusinesses || [];
      }
      return [];
    } catch (error) {
      console.error("Error checking for moved businesses:", error);
      return [];
    }
  };

  const handleRefreshInstance = async () => {
    if (!day || week <= 0) return;
    
    setInstanceLoading(true);
    const dateStr = getLocalDate(); // Use local date for Ridgecrest, CA

    try {
      const instanceRes = await fetch(
        `/api/schedule/daily-instances?date=${dateStr}&week=${week}&day=${day}`
      );
      
      if (instanceRes.ok) {
        const instanceData = await instanceRes.json();
        setCurrentInstance(instanceData.instance);
        setCleanTrack(instanceData.items || []);
        
        const completedBusinessIds = new Set(
          instanceData.items
            ?.filter((item: CleanTrackItem) => item.status === "cleaned")
            ?.map((item: CleanTrackItem) => item.business_id) || []
        );

        setSchedule(prev => prev.map(entry => ({
          ...entry,
          isCompleted: completedBusinessIds.has(entry.business_id)
        })));
      }
    } catch (error) {
      console.error("❌ Error refreshing instance:", error);
    } finally {
      setInstanceLoading(false);
    }
  };

  useEffect(() => {
    if (!day || week <= 0) return;

    const loadDailyData = async () => {
      setInstanceLoading(true);
      try {
        const dateStr = getLocalDate(); // Use local date for Ridgecrest, CA

        console.log("🔍 Loading daily data for:", { dateStr, week, day });

        // Initialize variables
        let instanceData = null;
        let allItems: CleanTrackItem[] = [];

        // Try to load the daily instance - but don't fail if it doesn't work
        try {
          const instanceRes = await fetch(
            `/api/schedule/daily-instances?date=${dateStr}&week=${week}&day=${day}`
          );
          
          if (instanceRes.ok) {
            instanceData = await instanceRes.json();
            setCurrentInstance(instanceData.instance);
            
            // Check for businesses moved to today from other days
            const movedToToday = await checkForMovedBusinesses(dateStr);
            allItems = [...(instanceData.items || []), ...movedToToday];
            
            setCleanTrack(allItems);
            console.log("✅ Loaded daily instance with", allItems.length, "items");
          } else {
            console.log("⚠️ Daily instance API failed, continuing without it");
            setCurrentInstance(null);
            setCleanTrack([]);
          }
        } catch (instanceError) {
          console.log("⚠️ Failed to load daily instance, continuing without it:", instanceError);
          setCurrentInstance(null);
          setCleanTrack([]);
        }

        // Load the regular schedule data - this should always work
        const scheduleData = await fetchSchedule(week, day);
        
        if (!scheduleData.schedule?.length) {
          setError("No businesses to clean today. Have a good day off!");
          setSchedule([]);
          return;
        }

        console.log("📊 Schedule data received:", scheduleData.schedule);

        // Get available members - filter out undefined/null and check they have name property
        const available = membersList.filter(
          (m) => m && m.name && m[day as keyof Member]
        );

        console.log("👥 Available members for", day, ":", available.map(m => m.name));

        // Get completed business IDs from clean track
        const completedBusinessIds = new Set(
          allItems
            ?.filter((item: CleanTrackItem) => item.status === "cleaned")
            ?.map((item: CleanTrackItem) => item.business_id) || []
        );

        const updated = scheduleData.schedule.map((entry: any) => {
          console.log("🏢 Processing business entry:", entry);
          
          const isCompleted = completedBusinessIds.has(entry.business_id);
          
          return {
            ...entry,
            isCompleted,
            jobs: assignRandomJobs(
              ["Sweep and Mop", "Vacuum", "Bathrooms and Trash"],
              available
            ),
            onClick: () => {
              console.log("🖱️ Business clicked:", entry);
              setToastInfo({
                business_id: entry.business_id,
                business_name: entry.business_name,
                before_open: entry.before_open,
                address: entry.address,
              });
            },
          };
        });

        setSchedule(updated);
        setError(null);

      } catch (err) {
        console.error("❌ Error loading daily data:", err);
        setError("Failed to load today's cleaning data");
        setSchedule([]);
        setCleanTrack([]);
      } finally {
        setInstanceLoading(false);
      }
    };

    loadDailyData();
  }, [week, day, membersList]);

  const randomizeSchedule = () => {
    const available = membersList.filter(
      (m) => m && m.name && m[day as keyof Member]
    );

    setSchedule((prev) =>
      prev.map((entry) => ({
        ...entry,
        jobs: assignRandomJobs(
          ["Sweep and Mop", "Vacuum", "Bathrooms and Trash"],
          available
        ),
      }))
    );
  };

  const updateBusinessStatus = async (businessId: number, status: string, movedDate?: string) => {
    if (!currentInstance) {
      console.log("⚠️ No current instance, skipping status update");
      return;
    }

    try {
      const updateData: any = {
        instance_id: currentInstance.id,
        business_id: businessId,
        status
      };

      if (status === "moved" && movedDate) {
        updateData.moved_to_date = movedDate;
      }

      const res = await fetch("/api/schedule/daily-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData)
      });

      if (!res.ok) {
        throw new Error("Failed to update business status");
      }

      const result = await res.json();

      setCleanTrack(prev => prev.map(item => 
        item.business_id === businessId 
          ? { ...item, ...result.item }
          : item
      ));

      setSchedule(prev => prev.map(entry => 
        entry.business_id === businessId 
          ? { ...entry, isCompleted: status === "cleaned" }
          : entry
      ));

    } catch (error) {
      console.error("❌ Error updating business status:", error);
      alert("Failed to update business status. Please try again.");
    }
  };

  const handleToggleBusinessStatus = async (businessId: number) => {
    const currentItem = cleanTrack.find(item => item.business_id === businessId);
    if (!currentItem) return;

    let newStatus: string;
    if (currentItem.status === "pending") {
      newStatus = "cleaned";
    } else if (currentItem.status === "cleaned") {
      newStatus = "pending";
    } else {
      return;
    }

    await updateBusinessStatus(businessId, newStatus);
  };

  const handleMoveBusinessToDate = async (businessId: number, date: string) => {
    if (!date) return;

    await updateBusinessStatus(businessId, "moved", date);
  };

  const handleDateChange = (businessId: number, date: string) => {
    // This function is no longer needed with the new move flow
  };

  const handleAddBusiness = async (businessId: number, notes?: string) => {
    if (!currentInstance) {
      console.log("⚠️ No current instance, cannot add business");
      alert("Please refresh the page to create today's instance first");
      return;
    }

    try {
      console.log(`➕ Adding business ${businessId} to today's track`);

      // First, get the business details
      const businessRes = await fetch(`/api/schedule/businesses?id=${businessId}`);
      if (!businessRes.ok) throw new Error('Failed to fetch business details');
      const businessData = await businessRes.json();

      // Add to current instance
      const addData = {
        instance_id: currentInstance.id,
        business_id: businessId,
        status: 'pending',
        notes: notes || 'Added on-the-fly - moved from another day'
      };

      const res = await fetch("/api/schedule/daily-instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addData)
      });

      if (!res.ok) throw new Error("Failed to add business to instance");

      const result = await res.json();
      console.log("✅ Business added to instance:", result);

      // Update local clean track state
      const newItem: CleanTrackItem = {
        id: result.item.id,
        business_id: businessId,
        business_name: businessData.business_name,
        address: businessData.address,
        before_open: businessData.before_open,
        status: 'pending',
        notes: notes || 'Added on-the-fly - moved from another day',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      setCleanTrack(prev => [...prev, newItem]);

      // Update schedule list to show the new business
      const available = membersList.filter(
        (m) => m && m.name && m[day as keyof Member]
      );

      const newScheduleItem = {
        business_id: businessId,
        business_name: businessData.business_name,
        address: businessData.address,
        before_open: businessData.before_open,
        isCompleted: false,
        jobs: assignRandomJobs(
          ["Sweep and Mop", "Vacuum", "Bathrooms and Trash"],
          available
        ),
        onClick: () => {
          setToastInfo({
            business_id: businessId,
            business_name: businessData.business_name,
            before_open: businessData.before_open,
            address: businessData.address,
          });
        },
      };

      setSchedule(prev => [...prev, newScheduleItem]);

      console.log("✅ Added business to both Clean Track and Schedule");

    } catch (error) {
      console.error("❌ Error adding business:", error);
      alert("Failed to add business. Please try again.");
    }
  };

  return (
    <div
      className={`p-4 ${
        isDark
          ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
      }`}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">
          Cleaning Schedule
        </h2>
        <div className="flex items-center mt-2">
          <Calendar
            size={18}
            className="mr-2 text-[hsl(var(--sidebar-primary))]"
          />
          <span className="text-[hsl(var(--muted-foreground))]">
            Week {week} - {day.charAt(0).toUpperCase() + day.slice(1)} ({getLocalDate()})
          </span>
        </div>
      </div>

      <div className="mb-6">
        <WeatherWidget />
        <RandomizerButton onClick={randomizeSchedule} />
      </div>

      <div className="mb-6 border-b border-[hsl(var(--border))]">
        <ul className="flex flex-wrap -mb-px">
          <li className="mr-6">
            <button
              onClick={() => setActiveTab("schedule")}
              className={`inline-block py-2 ${
                activeTab === "schedule"
                  ? "text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              Schedule
            </button>
          </li>
          <li className="mr-6">
            <button
              onClick={() => setActiveTab("team")}
              className={`inline-block py-2 ${
                activeTab === "team"
                  ? "text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              Team Members
            </button>
          </li>
          <li className="mr-6">
            <button
              onClick={() => setActiveTab("clean-track")}
              className={`inline-block py-2 flex items-center ${
                activeTab === "clean-track"
                  ? "text-[hsl(var(--sidebar-primary))] border-b-2 border-[hsl(var(--sidebar-primary))]"
                  : "text-[hsl(var(--muted-foreground))]"
              }`}
            >
              <CheckCircle2 size={16} className="mr-1" />
              Clean Track
            </button>
          </li>
        </ul>
      </div>

      {error ? (
        <div
          className={`rounded-lg p-8 mb-6 ${
            isDark
              ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]"
              : "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
          }`}
        >
          <h3 className="text-2xl font-bold mb-2">Good News!</h3>
          <p className="text-lg">{error}</p>
        </div>
      ) : (
        <>
          {activeTab === "schedule" && schedule.length > 0 && (
            <ScheduleList
              schedule={schedule.map((entry) => ({
                ...entry,
                onClick: () => {
                  console.log("📋 ScheduleList business clicked:", entry);
                  setToastInfo({
                    business_id: entry.business_id,
                    business_name: entry.business_name,
                    before_open: entry.before_open,
                    address: entry.address,
                  });
                },
              }))}
            />
          )}

          {activeTab === "team" && (
            <TeamMembersList 
              members={membersList} 
              currentDay={day} 
            />
          )}
          
          {activeTab === "clean-track" && (
            <CleanTrack
              cleanTrack={cleanTrack}
              currentInstance={currentInstance}
              currentDay={day}
              week={week}
              instanceLoading={instanceLoading}
              onToggleBusinessStatus={handleToggleBusinessStatus}
              onMoveBusinessToDate={handleMoveBusinessToDate}
              onRefreshInstance={handleRefreshInstance}
              onAddBusiness={handleAddBusiness}
            />
          )}
        </>
      )}

      {toastInfo && (
        <Toast 
          business_id={toastInfo.business_id}
          business_name={toastInfo.business_name}
          address={toastInfo.address}
          before_open={toastInfo.before_open}
          onClose={() => setToastInfo(null)} 
        />
      )}
    </div>
  );
};

export default Hero;