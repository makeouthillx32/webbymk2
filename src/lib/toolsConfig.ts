import TimesheetCalculator from "@/components/tools/timesheet-calculator";
import PunchCardMaker from "@/components/tools/PunchCardMaker";

export const tools = [
  {
    name: "Timesheet Calculator",
    path: "/Tools/timesheet-calculator",
    component: TimesheetCalculator,
  },
  {
    name: "Punch Card Maker",
    path: "/Tools/punch-card-maker",
    component: PunchCardMaker,
  },
];