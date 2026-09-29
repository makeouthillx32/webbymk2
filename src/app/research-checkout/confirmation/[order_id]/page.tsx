// app/research-checkout/confirmation/[order_id]/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Package, Clock, Copy, Check, ShieldCheck, ArrowRight } from "lucide-react";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";

export default function ResearchOrderConfirmationPage({ params }: { params: Promise<{ order_id: string }> }) {
  const resolvedParams = use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { clearCart } = useResearchCart();
  const cartCleared = useRef(false);

  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    fetchOrder();

    sessionStorage.removeItem("rx_checkout_email");
    sessionStorage.removeItem("rx_checkout_shipping_address");
    sessionStorage.removeItem("rx_checkout_shipping_rate_id");
    sessionStorage.removeItem("rx_checkout_shipping_rate_data");
    sessionStorage.removeItem("rx_checkout_marketing_opt_in");

    if (!cartCleared.current) {
      cartCleared.current = true;
      clearCart().catch((e) => console.warn("Research cart clear failed (may already be empty):", e));
    }
  }, []);

  const fetchOrder = async () => {
    try {
      const response = await fetch(`/api/orders/${resolvedParams.order_id}`);
      const data = await response.json();
      if (data.order) setOrder(data.order);
    } catch (error) {
      console.error("Failed to fetch order:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "memo" | "email") => {
    navigator.clipboard.writeText(text);
    if (type === "memo") {
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--primary))]" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="text-center max-w-md p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-4">Order record not found</p>
          <Button asChild className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Link href="/">Return to Catalog</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isZelle = order.payment_method === "zelle" || order.payment_status === "pending";
  const formattedTotal = `$${(order.total_cents / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Top Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-[hsl(var(--card-foreground))]">
            Unenter Labs
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--primary))]" />
            Order #{order.order_number}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Status Hero */}
        <div className="text-center mb-10">
          {isZelle ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] mb-4 shadow-sm">
                <Clock className="w-9 h-9 text-[hsl(var(--primary))]" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[hsl(var(--card-foreground))] mb-2">
                Order Submitted — Awaiting Payment
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-lg mx-auto leading-relaxed">
                Thank you, your research order has been recorded. Please complete your Zelle payment below to initiate fulfillment.
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] mb-4 shadow-sm">
                <CheckCircle className="w-9 h-9 text-[hsl(var(--primary))]" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[hsl(var(--card-foreground))] mb-2">
                Order Confirmed!
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-lg mx-auto leading-relaxed">
                Thank you for your order. We have received your payment and will begin processing your shipment shortly.
              </p>
            </>
          )}
        </div>

        {/* Dedicated Zelle Instructions Callout (if offline order) */}
        {isZelle && (
          <div className="mb-8 rounded-2xl border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--card))] p-6 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4">
              <div className="flex items-center gap-2 text-base font-extrabold text-[hsl(var(--card-foreground))]">
                <span>💳</span>
                <h2>Offline Payment Instructions</h2>
              </div>
              <span className="rounded-full border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.12)] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
                Amount Due: {formattedTotal}
              </span>
            </div>

            <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
              Send your payment via Zelle using the details below. Include your order number in the payment notes so our fulfillment team can match your order instantly:
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Zelle Destination */}
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))]">
                    Send Payment To (Zelle)
                  </span>
                  <div className="font-mono text-sm font-bold text-[hsl(var(--primary))] mt-0.5">
                    labs@unenter.live
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard("labs@unenter.live", "email")}
                  className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--muted))] transition flex items-center gap-1 text-[hsl(var(--card-foreground))]"
                >
                  {copiedEmail ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              {/* Memo Note */}
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-[hsl(var(--muted-foreground))]">
                    Required Payment Note / Memo
                  </span>
                  <div className="font-mono text-sm font-bold text-[hsl(var(--card-foreground))] mt-0.5">
                    Order #{order.order_number}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`Order #${order.order_number}`, "memo")}
                  className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--muted))] transition flex items-center gap-1 text-[hsl(var(--card-foreground))]"
                >
                  {copiedMemo ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Requirements List */}
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 space-y-2 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[hsl(var(--card-foreground))]">
                <span>⚠️</span>
                <span>Important Payment Requirements:</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-[hsl(var(--muted-foreground))] leading-relaxed">
                <li>All payments must be sent using the “Friends & Family” option.</li>
                <li>Payments sent as “Goods & Services” will be voided and refunded.</li>
                <li>Include your order number in the payment notes, nothing else.</li>
                <li>Your order will not begin processing until payment has been received and verified.</li>
              </ul>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="p-6 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))] shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Package className="w-5 h-5 text-[hsl(var(--primary))]" />
                <h2 className="text-base font-bold text-[hsl(var(--card-foreground))]">Order Information</h2>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Order Number</span>
                  <span className="font-mono font-bold text-[hsl(var(--primary))]">#{order.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Payment Status</span>
                  <span className="capitalize font-semibold text-[hsl(var(--card-foreground))]">
                    {order.payment_status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Payment Method</span>
                  <span className="capitalize font-semibold text-[hsl(var(--card-foreground))]">
                    {order.payment_method === "zelle" ? "Zelle (Offline)" : order.payment_method || "Credit Card"}
                  </span>
                </div>
                {(order.customer_email || order.email) && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Email</span>
                    <span className="text-[hsl(var(--card-foreground))]">{order.customer_email || order.email}</span>
                  </div>
                )}
              </div>
            </div>

            {order.items && order.items.length > 0 && (
              <div className="p-6 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))] shadow-sm">
                <h2 className="text-base font-bold mb-4 text-[hsl(var(--card-foreground))]">Items Ordered</h2>
                <div className="divide-y divide-[hsl(var(--border))]">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="py-3 flex justify-between text-xs">
                      <div>
                        <p className="font-semibold text-[hsl(var(--card-foreground))]">{item.title || item.product_title}</p>
                        {item.variant_title && item.variant_title !== "Default" && (
                          <p className="text-[hsl(var(--muted-foreground))] text-[11px]">{item.variant_title}</p>
                        )}
                        <p className="text-[hsl(var(--muted-foreground))] text-[11px] mt-0.5">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-bold text-[hsl(var(--card-foreground))] tabular-nums">
                        ${((item.price_cents * item.quantity) / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="p-6 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))] shadow-sm space-y-3">
              <h2 className="text-base font-bold text-[hsl(var(--card-foreground))]">Order Summary</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Subtotal</span>
                  <span className="text-[hsl(var(--card-foreground))] font-semibold tabular-nums">
                    ${(order.subtotal_cents / 100).toFixed(2)}
                  </span>
                </div>
                {order.discount_cents > 0 && (
                  <div className="flex justify-between text-[hsl(var(--primary))] font-semibold">
                    <span>Discount{order.promo_code ? ` (${order.promo_code})` : ""}</span>
                    <span>−${(order.discount_cents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[hsl(var(--muted-foreground))]">Shipping</span>
                  <span className="text-[hsl(var(--card-foreground))] font-semibold tabular-nums">
                    {order.shipping_cents === 0 ? "Free" : `$${(order.shipping_cents / 100).toFixed(2)}`}
                  </span>
                </div>
                {order.tax_cents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--muted-foreground))]">Tax</span>
                    <span className="text-[hsl(var(--card-foreground))] font-semibold tabular-nums">
                      ${(order.tax_cents / 100).toFixed(2)}
                    </span>
                  </div>
                )}
                <Separator className="border-[hsl(var(--border))]" />
                <div className="flex justify-between font-extrabold text-base text-[hsl(var(--card-foreground))]">
                  <span>Total</span>
                  <span className="text-[hsl(var(--primary))] tabular-nums">
                    ${(order.total_cents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {order.shipping_address && (
              <div className="p-6 border border-[hsl(var(--border))] rounded-xl bg-[hsl(var(--card))] shadow-sm">
                <h2 className="text-base font-bold mb-3 text-[hsl(var(--card-foreground))]">Shipping Destination</h2>
                <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1">
                  {order.shipping_address.firstName && (
                    <p className="text-[hsl(var(--card-foreground))] font-semibold">
                      {order.shipping_address.firstName} {order.shipping_address.lastName}
                    </p>
                  )}
                  {order.shipping_address.address1 && <p>{order.shipping_address.address1}</p>}
                  {order.shipping_address.address2 && <p>{order.shipping_address.address2}</p>}
                  <p>
                    {[order.shipping_address.city, order.shipping_address.state, order.shipping_address.zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <Button asChild size="lg" className="rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold shadow hover:opacity-90">
                <Link href="/account">
                  View in Your Researcher Portal
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-xl border-[hsl(var(--border))] text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--muted)/0.3)]">
                <Link href="/">Continue Browsing</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}