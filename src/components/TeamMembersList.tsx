import { useTheme } from "@/app/provider";

interface Member {
  id: number;
  name: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
}

interface TeamMembersListProps {
  members: Member[];
  currentDay: string;
}

const days = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export default function TeamMembersList({ members, currentDay }: TeamMembersListProps) {
  const { themeType } = useTheme();
  const isDark = themeType === "dark";

  const available = members.filter(
    (m) => m[currentDay as keyof Member]
  );

  const avatarColors = [
    "bg-[hsl(var(--chart-1))]",
    "bg-[hsl(var(--chart-2))]",
    "bg-[hsl(var(--chart-3))]",
    "bg-[hsl(var(--chart-4))]",
    "bg-[hsl(var(--chart-5))]",
  ];

  return (
    <div
      className={`rounded-lg p-4 ${
        isDark
          ? "bg-[hsl(var(--card))] shadow-[var(--shadow-md)]"
          : "bg-[hsl(var(--background))] shadow-[var(--shadow-sm)]"
      }`}
    >
      <h3 className="text-xl font-bold mb-4">Available Team Members</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {available.map((member, i) => (
          <div
            key={member.id}
            className={`p-4 rounded-lg ${
              isDark
                ? "bg-[hsl(var(--secondary))]"
                : "bg-[hsl(var(--muted))]"
            }`}
          >
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[hsl(var(--primary-foreground))] ${
                  avatarColors[i % avatarColors.length]
                }`}
              >
                {member.name.charAt(0)}
              </div>
              <div className="ml-3">
                <h4 className="font-medium">{member.name}</h4>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {days
                    .filter((d) => d !== currentDay && member[d as keyof Member])
                    .map(
                      (d) =>
                        d.charAt(0).toUpperCase() + d.slice(1)
                    )
                    .join(", ")}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}