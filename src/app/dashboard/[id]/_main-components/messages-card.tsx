// app/dashboard/[id]/messages/_components/messages-card.tsx

import { MessageCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface MessagesCardProps {
  today_msg: number;
}

export default function MessagesBlock({ today_msg }: MessagesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="inline-block" />
          Messages Today
        </CardTitle>
        <CardDescription className="text-2xl text-gray-300">
          {today_msg}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
