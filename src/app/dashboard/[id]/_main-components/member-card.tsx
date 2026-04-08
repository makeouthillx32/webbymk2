// app/dashboard/[id]/messages/_components/member-card.tsx

import { UsersRound } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface MemberCardProps {
  members: number;
}

export default function MemberBlock({ members }: MemberCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <UsersRound className="inline-block" />
          Current Members
        </CardTitle>
        <CardDescription className="text-2xl text-gray-300">
          {members}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
