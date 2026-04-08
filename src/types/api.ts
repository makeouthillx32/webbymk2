// types/api.ts
import { NextRequest } from 'next/server';

/**
 * Type definitions for API route handlers
 * 
 * These match exactly what Next.js expects for App Router API handlers
 */

// Don't create custom types for the context parameter
// Instead use exactly what Next.js expects

// Type for route parameters
export type ChannelParams = {
  params: {
    channel_id: string;
  };
};

// Type for nested route parameters
export type ChannelMessageParams = {
  params: {
    channel_id: string;
    message_id: string;
  };
};

// Handler function types using the exact Next.js expected signature
export type GetRouteHandler<P> = (
  req: NextRequest,
  context: P
) => Promise<Response>;

export type PostRouteHandler<P> = (
  req: NextRequest,
  context: P
) => Promise<Response>;

// And so on for other HTTP methods
export type PutRouteHandler<P> = (
  req: NextRequest,
  context: P
) => Promise<Response>;

export type DeleteRouteHandler<P> = (
  req: NextRequest,
  context: P
) => Promise<Response>;

export type PatchRouteHandler<P> = (
  req: NextRequest,
  context: P
) => Promise<Response>;

// You can add more specific handler types as needed