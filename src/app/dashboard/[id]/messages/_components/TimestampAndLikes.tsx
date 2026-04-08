// app/dashboard/[id]/messages/_components/TimestampAndLikes.tsx
'use client';

import React from 'react';
import { format } from 'date-fns';
import { Heart } from 'lucide-react';

interface TimestampAndLikesProps {
  timestamp: string;
  likes?: number;
  isBeingDeleted?: boolean;
  className?: string;
}

export default function TimestampAndLikes({ 
  timestamp, 
  likes = 0, 
  isBeingDeleted = false,
  className = ""
}: TimestampAndLikesProps) {
  
  const formatMessageTime = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'h:mm a');
    } catch {
      return '';
    }
  };

  return (
    <div className={`flex items-center mt-1 ml-1 ${className}`}>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">
        {formatMessageTime(timestamp)}
      </span>
      
      {likes > 0 && (
        <div className="ml-2 flex items-center text-xs text-[hsl(var(--destructive))]">
          <Heart size={12} fill="currentColor" className="mr-1" />
          {likes}
        </div>
      )}
      
      {isBeingDeleted && (
        <div className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">
          Deleting...
        </div>
      )}
    </div>
  );
}