interface ScheduleItem {
  business_name: string;
  jobs: { job_name: string; member_name: string }[];
  before_open: boolean;
  address: string;
}

interface GroupedSchedule {
  [day: string]: ScheduleItem[];
}

interface WeekListProps {
  groupedSchedule: GroupedSchedule;
}

export default function WeekList({ groupedSchedule }: WeekListProps) {
  return (
    <div>
      {Object.entries(groupedSchedule).map(([day, items]) => (
        <div key={day} className="mb-6">
          <h3 className="text-lg font-bold mb-2">{day}</h3> {/* Day header */}
          {items.map((item, index) => (
            <div key={index} className="ml-4 mb-4">
              <h4 className="underline cursor-pointer">{item.business_name}</h4>
              <p className="text-gray-600">{item.address}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}