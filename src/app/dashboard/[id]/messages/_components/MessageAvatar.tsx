// app/dashboard/[id]/messages/_components/MessageAvatar.tsx
'use client';

import React from 'react';

interface MessageAvatarProps {
  avatar: string;
  name: string;
  isCurrentUser?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function MessageAvatar({ 
  avatar, 
  name, 
  isCurrentUser = false,
  size = 'md',
  className = ""
}: MessageAvatarProps) {
  
  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8 md:w-10 md:h-10',
    lg: 'w-12 h-12'
  };

  // Chart colors for deterministic avatar generation
  const chartColors = [
    'bg-[hsl(var(--chart-1))]',
    'bg-[hsl(var(--chart-2))]',
    'bg-[hsl(var(--chart-3))]',
    'bg-[hsl(var(--chart-4))]',
    'bg-[hsl(var(--chart-5))]'
  ];

  const renderAvatarContent = () => {
    // If it's a URL, render image
    if (avatar.startsWith('http')) {
      return (
        <img
          src={avatar}
          alt={`${name}'s avatar`}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to initials if image fails to load
            const target = e.target as HTMLImageElement;
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = generateInitialsHTML(avatar || name);
            }
          }}
        />
      );
    }
    
    // Generate initials with deterministic color
    return (
      <div 
        className={`avatar-initials w-full h-full flex items-center justify-center ${getAvatarColorClass(avatar || name)}`}
      >
        <span className="text-xs font-semibold uppercase text-[hsl(var(--primary-foreground))]">
          {(avatar || name).charAt(0).toUpperCase()}
        </span>
      </div>
    );
  };

  const getAvatarColorClass = (text: string) => {
    const index = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % chartColors.length;
    return chartColors[index];
  };

  const generateInitialsHTML = (text: string) => {
    const colorClass = getAvatarColorClass(text);
    return `
      <div class="avatar-initials w-full h-full flex items-center justify-center ${colorClass}">
        <span class="text-xs font-semibold uppercase text-[hsl(var(--primary-foreground))]">
          ${text.charAt(0).toUpperCase()}
        </span>
      </div>
    `;
  };

  return (
    <div className={`
      message-avatar 
      ${sizeClasses[size]} 
      rounded-full 
      overflow-hidden 
      shadow-[var(--shadow-xs)] 
      flex-shrink-0
      ${className}
    `}>
      {renderAvatarContent()}
    </div>
  );
}