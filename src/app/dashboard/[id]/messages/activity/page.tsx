// app/dashboard/[id]/messages/activity/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Breadcrumb from "@/components/Breadcrumbs/dashboard";
import Last4Weeks from "./_components/last_4weeks";
import Last7d from "./_components/last_7d";
import Last24h from "./_components/last_24hrs";
import GeneralMessageDataCard from "./_components/general_data";
import ChatBox from "./_components/ChatBox";

export default function MessagesActivityPage() {
  return (
    <Suspense>
      <ClientComponent />
    </Suspense>
  );
}

function ClientComponent() {
  const { id: channelId } = useParams();
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const res = await fetch(`/api/server/${channelId}/fetchMessageData`);
      const json = await res.json();
      setChartData(json.finalData || []);
      setLoading(false);
    }
    fetchData();
  }, [channelId]);

  if (loading) {
    return (
      <>
        <Breadcrumb pageName="Messages Analytics" />
        <div className="mt-10 ml-10 text-2xl">Messages Analytics</div>
        <hr className="mt-2 mr-5 ml-5 w-50 sm:w-dvh" />

        <div className="mt-10 ml-8 grid max-w-80 grid-rows-3 gap-y-4 sm:mr-5 sm:ml-10 sm:max-w-full sm:grid-cols-3 sm:grid-rows-none sm:gap-x-3 sm:gap-y-0">
          <Skeleton className="w-[250px] h-[150px] place-self-center rounded-xl" />
          <Skeleton className="w-[250px] h-[150px] place-self-center rounded-xl" />
          <Skeleton className="w-[250px] h-[150px] place-self-center rounded-xl" />
        </div>

        <div className="ml-10 mr-5">
          <Skeleton className="mt-50 w-dvh h-[150px] place-self-center rounded-xl" />
        </div>

        <div className="mt-5 pb-5 text-center text-gray-600 text-xs">
          Loading chat...
        </div>
      </>
    );
  }

  const data_24h = chartData[0]?.HourData || [];
  const data_7d = chartData[0]?.WeekData || [];
  const data_4w = chartData[0]?.FourWeekData || [];
  const data_general = chartData[0]?.GeneralData || [];

  return (
    <>
      <Breadcrumb pageName="Messages Analytics" />
      <div className="mt-10 ml-10 text-2xl">Messages Analytics</div>
      <hr className="mt-2 mr-5 ml-5 w-50 sm:w-dvh" />

      <div className="mt-10 ml-8 grid max-w-80 grid-rows-3 gap-y-4 sm:mr-5 sm:ml-10 sm:max-w-full sm:grid-cols-3 sm:grid-rows-none sm:gap-x-3 sm:gap-y-0">
        <Last24h chartData={data_24h} />
        <Last7d chartData={data_7d} />
        <Last4Weeks chartData={data_4w} />
      </div>

      <div className="ml-10 mr-5">
        <GeneralMessageDataCard chartData={data_general} />
      </div>

      <div className="mt-10 ml-10 mr-5">
        <ChatBox channelId={channelId || ""} />
      </div>

      <div className="mt-5 pb-5 text-center text-gray-600 text-xs">
        Real-time Chat powered by Supabase
      </div>
    </>
  );
}