// Z:\code\FEver-main\src\app\[locale]\calendar\page.tsx

import { getCalendarData } from "@/data/calendarData";  // Fetch calendar data
import Breadcrumb from "@/components/Common/Breadcrumb";
import Calendar from "@/components/Common/Calendar";  // Client-side Calendar component

export default async function CalendarPage() {
  // Fetch localized data (title, description)
  const { title, paragraph } = await getCalendarData();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Breadcrumb Component */}
      <Breadcrumb pageName={title} description={paragraph} />

      {/* Only pass non-color data */}
      <Calendar />
    </div>
  );
}
