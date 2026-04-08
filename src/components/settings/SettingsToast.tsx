// components/settings/SettingsToast.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui-elements/alert';
import { AlertTriangle, Shield, Lock, ArrowRight } from 'lucide-react';

interface SettingsToastProps {
  type: 'auth' | 'role' | 'missing';
  message: string;
  userRole?: string;
  redirectTo: string;
  delay?: number; // milliseconds
}

export const SettingsToast: React.FC<SettingsToastProps> = ({
  type,
  message,
  userRole,
  redirectTo,
  delay = 3000
}) => {
  const [countdown, setCountdown] = useState(Math.floor(delay / 1000));
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Countdown timer
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          // Fade out and redirect
          setIsVisible(false);
          setTimeout(() => {
            router.push(redirectTo);
          }, 300); // Allow fade out animation
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [redirectTo, router]);

  const getAlertConfig = () => {
    switch (type) {
      case 'auth':
        return {
          variant: 'warning' as const,
          title: 'Authentication Required',
          description: message,
          icon: <Lock className="w-5 h-5" />
        };
      case 'role':
        return {
          variant: 'error' as const,
          title: 'Access Denied',
          description: `${message}${userRole ? ` (Current role: ${userRole})` : ''}`,
          icon: <Shield className="w-5 h-5" />
        };
      case 'missing':
        return {
          variant: 'warning' as const,
          title: 'Page Not Found',
          description: message,
          icon: <AlertTriangle className="w-5 h-5" />
        };
      default:
        return {
          variant: 'warning' as const,
          title: 'Notice',
          description: message,
          icon: <AlertTriangle className="w-5 h-5" />
        };
    }
  };

  const config = getAlertConfig();

  return (
    <>
      {/* Full page overlay for mobile, fixed positioning for desktop */}
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-start justify-center pt-20 px-4">
        <div 
          className={`max-w-md w-full transition-all duration-300 ${
            isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4'
          }`}
        >
          {/* iOS-style notification card */}
          <div 
            className="rounded-xl shadow-lg overflow-hidden"
            style={{
              backgroundColor: 'hsl(var(--card))',
              borderColor: config.variant === 'error' ? '#BC1C21' : '#FFB800',
              borderWidth: '1px',
              borderStyle: 'solid'
            }}
          >
            {/* Header with icon and close */}
            <div 
              className="flex items-center gap-3 p-4 pb-3"
              style={{
                backgroundColor: config.variant === 'error' 
                  ? 'hsl(var(--destructive) / 0.1)' 
                  : 'hsl(var(--secondary) / 0.3)'
              }}
            >
              <div className="flex-shrink-0">
                {config.icon}
              </div>
              <h5 
                className="font-semibold text-sm flex-1"
                style={{ 
                  color: config.variant === 'error' ? '#BC1C21' : '#9D5425',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {config.title}
              </h5>
              <button
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(() => router.push(redirectTo), 300);
                }}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 hover:scale-110"
                style={{
                  backgroundColor: config.variant === 'error' ? '#BC1C21' : '#FFB800',
                  color: 'white'
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="px-4 pb-4">
              <div 
                className="text-sm mb-3 leading-relaxed"
                style={{ 
                  color: 'hsl(var(--foreground))',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                {config.description}
              </div>

              {/* Countdown */}
              <div 
                className="flex items-center gap-2 text-xs mb-3"
                style={{ 
                  color: 'hsl(var(--muted-foreground))',
                  fontFamily: 'var(--font-sans)'
                }}
              >
                <ArrowRight className="w-3 h-3" />
                <span>Redirecting in {countdown}s</span>
              </div>

              {/* Progress bar */}
              <div 
                className="w-full bg-gray-200 rounded-full h-1.5"
                style={{ backgroundColor: 'hsl(var(--muted) / 0.3)' }}
              >
                <div 
                  className="h-1.5 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    backgroundColor: config.variant === 'error' ? '#BC1C21' : '#FFB800',
                    width: `${((delay / 1000 - countdown) / (delay / 1000)) * 100}%`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Additional help text */}
          <div 
            className="mt-3 p-3 rounded-lg text-xs"
            style={{
              backgroundColor: 'hsl(var(--muted) / 0.8)',
              color: 'hsl(var(--muted-foreground))',
              fontFamily: 'var(--font-sans)'
            }}
          >
            {type === 'auth' && (
              <div>
                <strong>Need help?</strong> Contact your administrator or use the sign-in link.
              </div>
            )}
            {type === 'role' && (
              <div>
                <strong>Role Requirements:</strong> Settings access requires admin, job coach, or client role.
              </div>
            )}
            {type === 'missing' && (
              <div>
                <strong>Available Settings:</strong> Profile, CMS, Catalog, Tools
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};