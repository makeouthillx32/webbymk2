import { MessageCircle, UsersRound } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface BottomCardProps {
  channelName: string;
  participantCount: number;
  messageCount: number;
  lastActiveAt?: string; // ISO timestamp of last message
  avatarUrl?: string;
}

export default function BottomCard({
  channelName,
  participantCount,
  messageCount,
  lastActiveAt,
  avatarUrl,
}: BottomCardProps) {
  return (
    <Card className="mt-10 grid grid-cols-1 gap-4 p-6 sm:grid-cols-5">
      {/* Channel Avatar */}
      <div className="col-span-1 flex items-center justify-center">
        <Avatar className="h-20 w-20">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={channelName} />
          ) : (
            <AvatarFallback>
              {channelName.charAt(0)}
            </AvatarFallback>
          )}
        </Avatar>
      </div>

      {/* Channel Info */}
      <div className="col-span-2 flex flex-col justify-center text-center sm:text-left">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">
            {channelName}
          </CardTitle>
          <CardDescription className="text-sm text-gray-500">
            Participants: {participantCount}
          </CardDescription>
        </CardHeader>
      </div>

      {/* Metrics */}
      <div className="col-span-2 flex flex-col justify-center space-y-2 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <UsersRound />
          <span>{participantCount} members</span>
        </div>
        <div className="flex items-center gap-2">
          <MessageCircle />
          <span>{messageCount} messages</span>
        </div>
        {lastActiveAt && (
          <div className="text-xs text-gray-400">
            Last active: {new Date(lastActiveAt).toLocaleString()}
          </div>
        )}
      </div>
    </Card>
  );
}