"use client";

import { useEffect, useRef, useCallback } from "react";

type UseRealtimeParams<T> = {
  supabase: any;
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  onEvent: (payload: {
    new: T;
    old: T | null;
    eventType: string;
  }) => void;
  channelNamePrefix?: string;
  enabled?: boolean;
};

export function useRealtime<T>({
  supabase,
  table,
  filter,
  event = "INSERT",
  onEvent,
  channelNamePrefix = "realtime",
  enabled = true,
}: UseRealtimeParams<T>) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSubscribedRef = useRef(false);
  const currentConfigRef = useRef<string>('');
  
  // Store the latest onEvent callback in a ref so we can use it without causing re-renders
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !table || !supabase) {
      console.log("[Realtime] Hook disabled or missing params:", {
        enabled,
        table,
        hasSupabase: !!supabase,
      });
      return;
    }

    // Create a config hash to prevent unnecessary re-subscriptions
    const configHash = `${table}-${filter || 'all'}-${event}`;
    
    // If this exact config is already subscribed, don't recreate
    if (isSubscribedRef.current && currentConfigRef.current === configHash && channelRef.current) {
      console.log(`[Realtime] Already subscribed to ${configHash}, skipping recreation`);
      return;
    }

    // Clean up any existing subscription first
    if (channelRef.current) {
      console.log(`[Realtime] Cleaning up existing channel for config change`);
      try {
        supabase.removeChannel(channelRef.current);
      } catch (err) {
        console.error('[Realtime] Error removing old channel:', err);
      }
      channelRef.current = null;
      isSubscribedRef.current = false;
    }

    const channelName = `${channelNamePrefix}-${configHash}-${Date.now()}`;
    console.log(`[Realtime] Creating channel: ${channelName}`, {
      table,
      filter,
      event,
    });

    // Build postgres_changes config
    let config: any = {
      event,
      schema: "public",
      table,
    };

    // Add filter if provided
    if (filter) {
      console.log(`[Realtime] Parsing filter: "${filter}"`);
      
      const eqMatch = filter.match(/^([^=]+)=eq\.(.+)$/);
      if (eqMatch) {
        config.filter = `${eqMatch[1]}=eq.${eqMatch[2]}`;
        console.log(`[Realtime] Created filter config:`, config);
      } else {
        console.warn(`[Realtime] Could not parse filter: "${filter}". Expected format: column=eq.value`);
      }
    }

    try {
      const channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          config,
          (payload: any) => {
            console.log(`[Realtime] Received ${payload.eventType} event:`, payload);
            try {
              // Use the ref to get the latest callback without causing re-renders
              onEventRef.current({
                new: payload.new as T,
                old: payload.old as T | null,
                eventType: payload.eventType,
              });
            } catch (err) {
              console.error(`[Realtime] Error processing event:`, err);
            }
          }
        )
        .subscribe((status: string) => {
          console.log(`[Realtime] Channel ${channelName} status: ${status}`);
          
          if (status === "SUBSCRIBED") {
            console.log(`[Realtime] Successfully subscribed to ${table} ${event} events`);
            isSubscribedRef.current = true;
            currentConfigRef.current = configHash;
          } else if (status === "CLOSED") {
            isSubscribedRef.current = false;
            currentConfigRef.current = '';
          } else if (status === "TIMED_OUT") {
            console.error(`[Realtime] Subscription timed out for ${channelName}`);
            isSubscribedRef.current = false;
            currentConfigRef.current = '';
          } else if (status === "CHANNEL_ERROR") {
            console.error(`[Realtime] Channel error for ${channelName}. This usually means:`);
            console.error(`  1. Table '${table}' doesn't exist`);
            console.error(`  2. RLS (Row Level Security) is blocking access`);
            console.error(`  3. Realtime is not enabled for table '${table}'`);
            console.error(`  4. Filter '${filter}' is invalid`);
            isSubscribedRef.current = false;
            currentConfigRef.current = '';
          } else if (status !== "SUBSCRIBED") {
            console.warn(`[Realtime] Unexpected subscription status: ${status}`);
          }
        });

      channelRef.current = channel;
      console.log(`[Realtime] Channel created and stored`);
    } catch (err) {
      console.error(`[Realtime] Error creating channel:`, err);
      isSubscribedRef.current = false;
      currentConfigRef.current = '';
    }

    return () => {
      console.log(`[Realtime] Cleaning up channel: ${channelName}`);
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
          console.log(`[Realtime] Successfully removed channel ${channelName}`);
        } catch (err) {
          console.error(`[Realtime] Error removing channel:`, err);
        }
        channelRef.current = null;
      }
      isSubscribedRef.current = false;
      currentConfigRef.current = '';
    };
  }, [supabase, table, filter, event, channelNamePrefix, enabled]); // Removed onEvent from dependencies!

  // Additional cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        try {
          supabase?.removeChannel(channelRef.current);
        } catch (err) {
          console.error('[Realtime] Error during unmount cleanup:', err);
        }
      }
    };
  }, [supabase]);
}

// Simpler hook for INSERT-only usage
export function useRealtimeInsert<T>({
  supabase,
  table,
  filter,
  onInsert,
  enabled = true,
}: {
  supabase: any;
  table: string;
  filter?: string;
  onInsert: (newRow: T) => void;
  enabled?: boolean;
}) {
  // Store the latest onInsert callback in a ref
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  // Create a stable event handler that doesn't change
  const stableOnEvent = useCallback((payload: { new: T; old: T | null; eventType: string }) => {
    if (payload.new && payload.eventType === 'INSERT') {
      onInsertRef.current(payload.new);
    }
  }, []); // No dependencies!

  return useRealtime<T>({
    supabase,
    table,
    filter,
    event: "INSERT",
    onEvent: stableOnEvent,
    enabled,
  });
}