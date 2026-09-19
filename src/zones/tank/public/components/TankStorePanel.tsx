"use client";

import { useState } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Coins, Trophy, Home, Lock, ArrowLeft, BedDouble } from "lucide-react";
import { TANK_PRODUCTS, type TankProductKey } from "../../tankProducts";
import {
  createTankPurchaseIntent,
  createTankSubscriptionCheckout,
} from "../../server/tankStore";
import { useStripeLane } from "@/lib/stripe/useStripeLane";
import { TankEmbeddedCheckout } from "./TankEmbeddedCheckout";

const PRODUCT_ICON: Record<TankProductKey, React.ReactNode> = {
  season_pass: <Trophy className="h-5 w-5" />,
  season_pass_xl: <Trophy className="h-5 w-5" />,
  tokens_500: <Coins className="h-5 w-5" />,
  tokens_1500: <Coins className="h-5 w-5" />,
  tokens_5000: <Coins className="h-5 w-5" />,
  room_vip: <Home className="h-5 w-5" />,
  tank_bnb: <BedDouble className="h-5 w-5" />,
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function CheckoutForm({ onBack, mode }: { onBack: () => void; mode: "test" | "live" }) {
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
        {/* Derived, not hardcoded. This said "Test-mode purchase" regardless of
            mode, so a real customer paying a real card would have been told the
            charge was not real. */}
        <p className="mt-1 text-xs text-slate-400">
          {mode === "test"
            ? "Test-mode purchase — no real charge. Fulfilment runs off the Stripe webhook; refresh in a few seconds to see it land."
            : "Fulfilment runs off the Stripe webhook — refresh in a few seconds and your tokens or pass will be there."}
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
      {mode === "test" ? (
        <p className="text-center text-[10px] text-slate-500">Test mode — no real charge.</p>
      ) : null}
    </form>
  );
}

export function TankStorePanel({
  productKeys,
}: {
  productKeys?: TankProductKey[];
} = {}) {
  const stripeLane = useStripeLane("tank");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<TankProductKey | null>(null);
  const [category, setCategory] = useState("tokens");
  const [selectedProduct, setSelectedProduct] = useState<TankProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionCheckout, setSubscriptionCheckout] = useState<{ clientSecret: string; title: string } | null>(null);

  const handleSelect = async (key: TankProductKey) => {
    setBusyKey(key);
    setError(null);
    if (key === "season_pass" || key === "season_pass_xl") {
      const subscription = await createTankSubscriptionCheckout(key);
      if (subscription.success) {
        // In-page, like the Season Pass overlay. The redirect this replaced
        // dropped the viewer out of Tank and stopped the stream they were
        // watching just to take a payment.
        setSubscriptionCheckout({
          clientSecret: subscription.clientSecret,
          title: TANK_PRODUCTS[key].name,
        });
        setBusyKey(null);
        return;
      }
      setBusyKey(null);
      setError(
        "error" in subscription && subscription.error
          ? subscription.error
          : "Could not start subscription checkout.",
      );
      return;
    }
    const res = await createTankPurchaseIntent(key);
    setBusyKey(null);
    if (res.success) {
      setClientSecret(res.clientSecret);
    } else {
      // Checked rather than narrowed: the discriminated union does not survive
      // the server-action boundary, and a silent failure here is a buyer
      // staring at a dead button with no reason given.
      setError("error" in res && res.error ? res.error : "Could not start checkout.");
    }
  };

  if (subscriptionCheckout) {

    return (

      <TankEmbeddedCheckout

        clientSecret={subscriptionCheckout.clientSecret}

        title={subscriptionCheckout.title}

        onClose={() => setSubscriptionCheckout(null)}

      />

    );

  }


  if (clientSecret) {
    if (stripeLane.error) return <p className="text-sm text-red-400">{stripeLane.error}</p>;
    if (!stripeLane.stripe) return <p className="text-sm text-white/60">Loading secure payment…</p>;
    return (
      <Elements stripe={stripeLane.stripe} options={{ clientSecret }}>
        <CheckoutForm onBack={() => setClientSecret(null)} mode={stripeLane.mode ?? "test"} />
      </Elements>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-bold text-red-400">{error}</p>}
      {!productKeys && (
        <div role="group" aria-label="Shop categories" className="grid grid-cols-3 gap-2">
          {[{ key: "tokens", label: "Tokens" }, { key: "passes", label: "Passes" }, { key: "house", label: "Big Items" }].map((tab) => (
            <button key={tab.key} type="button" aria-pressed={category === tab.key}
              onClick={() => { setCategory(tab.key); setSelectedProduct(null); setError(null); }}
              className={`min-h-10 border-2 px-2 py-2 text-xs font-black uppercase shadow-[inset_0_1px_0_#ffffff50,0_2px_3px_#0005] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${category === tab.key ? "border-[#ad3b16] bg-[#ee602c] text-white" : "border-black/30 bg-[#637f6d] text-white hover:brightness-110"}`}>
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 border border-black/25 bg-black/10 p-3 sm:grid-cols-3">
      {(Object.values(TANK_PRODUCTS) as (typeof TANK_PRODUCTS)[TankProductKey][])
        .filter((product) => productKeys ? productKeys.includes(product.key) :
          category === "tokens" ? !!product.tokens : category === "passes" ? !!product.passTier : product.key === "tank_bnb")
        .map((product) => (
        <button
          key={product.key}
          type="button"
          aria-pressed={selectedProduct === product.key}
          onClick={() => { setSelectedProduct(product.key); setError(null); }}
          className={`flex min-w-0 flex-col items-center gap-2 border p-3 text-center shadow-[inset_0_1px_0_#ffffff40,0_2px_4px_#0003] transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${selectedProduct === product.key ? "border-[#ff4d00] bg-white/80" : "border-black/30 bg-white/40"}`}
        >
          <div aria-hidden="true" className="grid h-16 w-16 shrink-0 place-items-center border border-black/30 bg-[#20282b] text-[#ff854d] shadow-inner [&>svg]:h-9 [&>svg]:w-9">
            {PRODUCT_ICON[product.key]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black" style={{ color: "#241f14" }}>
              {product.name}
            </p>
          </div>
          <span className="shrink-0 text-sm font-black" style={{ color: "#241f14" }}>
            {busyKey === product.key
              ? "..."
              : `${formatUsd(product.amountCents)}${product.passTier ? "/mo" : ""}`}
          </span>
        </button>
      ))}
      </div>
      {selectedProduct && (
        <div className="space-y-2 border border-black/25 bg-white/50 p-3" aria-live="polite">
          <p className="text-sm font-black text-[#241f14]">{TANK_PRODUCTS[selectedProduct].name}</p>
          <p className="text-xs text-[#4c4630]">{TANK_PRODUCTS[selectedProduct].description}</p>
          {TANK_PRODUCTS[selectedProduct].monthlyTokens && <p className="text-xs font-bold text-[#385441]">Awards ₮{TANK_PRODUCTS[selectedProduct].monthlyTokens} each month. Paid in dollars.</p>}
          <button type="button" disabled={busyKey !== null} onClick={() => handleSelect(selectedProduct)}
            className="min-h-11 w-full border-2 border-[#ad3b16] bg-[#ee602c] px-3 py-2 text-xs font-black text-white shadow-[inset_0_1px_0_#ffffff50] disabled:opacity-50">
            {busyKey ? "Opening checkout…" : `Continue · ${formatUsd(TANK_PRODUCTS[selectedProduct].amountCents)}${TANK_PRODUCTS[selectedProduct].passTier ? "/month" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
export default TankStorePanel;
