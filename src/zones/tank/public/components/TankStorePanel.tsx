"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Coins, Trophy, Home, Lock, ArrowLeft } from "lucide-react";
import { TANK_PRODUCTS, type TankProductKey } from "../../tankProducts";
import { createTankPurchaseIntent } from "../../server/tankStore";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

const PRODUCT_ICON: Record<TankProductKey, React.ReactNode> = {
  season_pass: <Trophy className="h-5 w-5" />,
  tokens_500: <Coins className="h-5 w-5" />,
  tokens_1500: <Coins className="h-5 w-5" />,
  tokens_5000: <Coins className="h-5 w-5" />,
  room_vip: <Home className="h-5 w-5" />,
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function CheckoutForm({ onBack }: { onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/` },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed.");
      setProcessing(false);
      return;
    }

    setDone(true);
    setProcessing(false);
  };

  if (done) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-black text-emerald-400">Payment received!</p>
        <p className="mt-1 text-xs text-slate-400">
          Test-mode purchase — fulfillment runs off the Stripe webhook, refresh in a few seconds to see it land.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> Back to store
      </button>
      <PaymentElement />
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="flex w-full items-center justify-center gap-1.5 rounded bg-[#ff4d00] py-2 text-xs font-black uppercase text-white shadow disabled:opacity-50"
      >
        <Lock className="h-3.5 w-3.5" />
        {processing ? "Processing..." : "Pay Now"}
      </button>
      <p className="text-center text-[10px] text-slate-500">Test mode — no real charge.</p>
    </form>
  );
}

export function TankStorePanel() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<TankProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (key: TankProductKey) => {
    setBusyKey(key);
    setError(null);
    const res = await createTankPurchaseIntent(key);
    setBusyKey(null);
    if (res.success) {
      setClientSecret(res.clientSecret);
    } else {
      setError(res.error);
    }
  };

  if (clientSecret) {
    return (
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm onBack={() => setClientSecret(null)} />
      </Elements>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
      {(Object.values(TANK_PRODUCTS) as (typeof TANK_PRODUCTS)[TankProductKey][]).map((product) => (
        <button
          key={product.key}
          type="button"
          disabled={busyKey === product.key}
          onClick={() => handleSelect(product.key)}
          className="flex w-full items-center gap-3 rounded border border-black/20 bg-white/50 p-2.5 text-left transition hover:bg-white/80 disabled:opacity-50"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded bg-[#ff4d00]/15 text-[#ff4d00]">
            {PRODUCT_ICON[product.key]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black" style={{ color: "#241f14" }}>
              {product.name}
            </p>
            <p className="text-[10px] text-[#555]">{product.description}</p>
          </div>
          <span className="shrink-0 text-sm font-black" style={{ color: "#241f14" }}>
            {busyKey === product.key ? "..." : formatUsd(product.amountCents)}
          </span>
        </button>
      ))}
    </div>
  );
}
export default TankStorePanel;
