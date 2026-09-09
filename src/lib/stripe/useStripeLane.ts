"use client";

import { useEffect, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { PaymentLane } from "./commerce";

type LaneState = {
  stripe: PromiseLike<Stripe | null> | null;
  mode: "test" | "live" | null;
  error: string | null;
};

const stripeCache = new Map<string, PromiseLike<Stripe | null>>();

export function useStripeLane(lane: PaymentLane): LaneState {
  const [state, setState] = useState<LaneState>({ stripe: null, mode: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/stripe/config/${lane}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Stripe lane is unavailable");
        const cacheKey = `${payload.mode}:${payload.publishableKey}`;
        let stripe = stripeCache.get(cacheKey);
        if (!stripe) {
          stripe = loadStripe(payload.publishableKey);
          stripeCache.set(cacheKey, stripe);
        }
        setState({ stripe, mode: payload.mode, error: null });
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setState({ stripe: null, mode: null, error: error?.message ?? "Stripe lane is unavailable" });
        }
      });

    return () => controller.abort();
  }, [lane]);

  return state;
}
