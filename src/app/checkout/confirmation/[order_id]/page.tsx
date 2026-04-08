// app/checkout/confirmation/[order_id]/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, Package, Mail } from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";

export default function OrderConfirmationPage({ params }: { params: Promise<{ order_id: string }> }) {
  const resolvedParams = use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { clearCart } = useCart();
  const cartCleared = useRef(false);

  useEffect(() => {
    fetchOrder();

    // Clear checkout session storage
    sessionStorage.removeItem('checkout_email');
    sessionStorage.removeItem('checkout_shipping_address');
    sessionStorage.removeItem('checkout_billing_address');
    sessionStorage.removeItem('checkout_shipping_rate_id');
    sessionStorage.removeItem('promo_code');
    sessionStorage.removeItem('discount_cents');

    // Clear the cart (only once)
    if (!cartCleared.current) {
      cartCleared.current = true;
      clearCart().catch((e) => console.warn("Cart clear failed (may already be empty):", e));
    }
  }, []);

  const fetchOrder = async () => {
    try {
      const response = await fetch(`/api/orders/${resolvedParams.order_id}`);
      const data = await response.json();
      
      if (data.order) {
        setOrder(data.order);
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Order not found</p>
          <Button asChild>
            <Link href="/shop">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-2xl font-bold">Desert Cowgirl</Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Success Message */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Order Confirmed!</h1>
          <p className="text-muted-foreground">
            Thank you for your order. We'll get it shipped out to you soon.
          </p>
        </div>

        {/* Order Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Info */}
          <div className="space-y-6">
            <div className="p-6 border rounded-lg bg-card">
              <div className="flex items-center gap-3 mb-4">
                <Package className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Order Details</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Number</span>
                  <span className="font-mono font-semibold">{order.order_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="capitalize font-medium">{order.payment_status}</span>
                </div>
                {(order.customer_email || order.email) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{order.customer_email || order.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            {order.items && order.items.length > 0 && (
              <div className="p-6 border rounded-lg bg-card">
                <h2 className="text-lg font-semibold mb-4">Items Ordered</h2>
                <div className="space-y-3">
                  {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <div>
                        <p className="font-medium">{item.product_title}</p>
                        {item.variant_title && item.variant_title !== "Default" && (
                          <p className="text-muted-foreground text-xs">{item.variant_title}</p>
                        )}
                        <p className="text-muted-foreground text-xs">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold">
                        ${((item.price_cents * item.quantity) / 100).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="space-y-6">
            <div className="p-6 border rounded-lg bg-card">
              <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
                </div>
                {order.discount_cents > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Discount{order.promo_code ? ` (${order.promo_code})` : ""}</span>
                    <span>−${(order.discount_cents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{order.shipping_cents === 0 ? "Free" : `$${(order.shipping_cents / 100).toFixed(2)}`}</span>
                </div>
                {order.tax_cents > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>${(order.tax_cents / 100).toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>${(order.total_cents / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            {order.shipping_address && (
              <div className="p-6 border rounded-lg bg-card">
                <h2 className="text-lg font-semibold mb-3">Shipping To</h2>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  {order.shipping_address.full_name && <p className="text-foreground font-medium">{order.shipping_address.full_name}</p>}
                  {order.shipping_address.line1 && <p>{order.shipping_address.line1}</p>}
                  {order.shipping_address.line2 && <p>{order.shipping_address.line2}</p>}
                  <p>
                    {[order.shipping_address.city, order.shipping_address.region, order.shipping_address.postal_code]
                      .filter(Boolean).join(", ")}
                  </p>
                  {order.shipping_address.country && <p>{order.shipping_address.country}</p>}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button asChild size="lg">
                <Link href="/shop">Continue Shopping</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/account/history">View Order History</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}