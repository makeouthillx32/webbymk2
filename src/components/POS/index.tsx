// components/POS/index.tsx
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { POSCartItem, POSProduct, POSState, POSVariant } from "./types";
import type { POSDiscount } from "./DiscountPicker";
import type { PrinterConnection } from "@/lib/thermalPrinter";
import { Library } from "./Library";
import { Favorites } from "./Favorites";
import { Keypad } from "./Keypad";
import { VariantPicker } from "./VariantPicker";
import { Cart } from "./Cart";
import { Checkout } from "./Checkout";
import { Receipt } from "./Receipt";
import { CardReader } from "./CardReader";
import { POSSkeleton } from "./skeleton";
import { AlertCircle, RotateCcw } from "./icons";
import "./styles.scss";

// ─── Tab type ─────────────────────────────────────────────────────────────────
type POSTab = "reader" | "keypad" | "library" | "favorites";

// ─── Extended state ───────────────────────────────────────────────────────────
interface ExtendedPOSState extends POSState {
  activeTab: POSTab;
  readerConnected: boolean;
  chargeError: string | null;
  selectedDiscount: POSDiscount | null;
  printerConnection: PrinterConnection | null;
  paperWidth: 58 | 80;
}

type Action =
  | { type: "SET_PRODUCTS"; products: POSProduct[] }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SELECT_PRODUCT"; product: POSProduct | null }
  | { type: "ADD_TO_CART"; item: POSCartItem }
  | { type: "REMOVE_FROM_CART"; key: string }
  | { type: "SET_ITEM_QTY"; key: string; qty: number }
  | { type: "CLEAR_CART" }
  | { type: "SET_CUSTOMER_EMAIL"; email: string }
  | { type: "SET_CUSTOMER_FIRST_NAME"; name: string }
  | { type: "SET_CUSTOMER_LAST_NAME"; name: string }
  | { type: "SET_VIEW"; view: POSState["view"] }
  | { type: "SET_TAB"; tab: POSTab }
  | { type: "SET_PROCESSING"; isProcessing: boolean }
  | { type: "SET_READER_CONNECTED"; connected: boolean }
  | { type: "SET_CHARGE_ERROR"; error: string | null }
  | { type: "SET_DISCOUNT"; discount: POSDiscount | null }
  | { type: "SET_PRINTER_CONNECTION"; connection: PrinterConnection | null }
  | { type: "SET_PAPER_WIDTH"; width: 58 | 80 }
  | { type: "SET_PAYMENT_INTENT"; clientSecret: string; order: NonNullable<POSState["lastOrder"]> }
  | { type: "PAYMENT_SUCCESS" }
  | { type: "NEW_SALE" };

const initial: ExtendedPOSState = {
  products: [],
  cart: [],
  view: "catalog",
  search: "",
  filterCollection: null,
  filterCategory: null,
  selectedProduct: null,
  customerEmail: "",
  customerFirstName: "",
  customerLastName: "",
  loading: true,
  error: null,
  lastOrder: null,
  paymentIntentClientSecret: null,
  isProcessing: false,
  activeTab: "library",
  readerConnected: false,
  chargeError: null,
  selectedDiscount: null,
  printerConnection: null,
  paperWidth: 58 as const,
};

function reducer(state: ExtendedPOSState, action: Action): ExtendedPOSState {
  switch (action.type) {
    case "SET_PRODUCTS":           return { ...state, products: action.products, loading: false };
    case "SET_LOADING":            return { ...state, loading: action.loading };
    case "SET_ERROR":              return { ...state, error: action.error, loading: false };
    case "SELECT_PRODUCT":         return { ...state, selectedProduct: action.product };
    case "SET_TAB":                return { ...state, activeTab: action.tab };
    case "SET_READER_CONNECTED":   return { ...state, readerConnected: action.connected };
    case "SET_CHARGE_ERROR":        return { ...state, chargeError: action.error };
    case "SET_DISCOUNT":            return { ...state, selectedDiscount: action.discount };
    case "SET_PRINTER_CONNECTION":  return { ...state, printerConnection: action.connection };
    case "SET_PAPER_WIDTH":         return { ...state, paperWidth: action.width };
    case "REMOVE_FROM_CART":
      return { ...state, cart: state.cart.filter((i) => i.key !== action.key) };
    case "SET_ITEM_QTY": {
      if (action.qty <= 0) return { ...state, cart: state.cart.filter((i) => i.key !== action.key) };
      return { ...state, cart: state.cart.map((i) => i.key === action.key ? { ...i, quantity: action.qty } : i) };
    }
    case "ADD_TO_CART": {
      const existing = state.cart.find((i) => i.key === action.item.key);
      if (existing) {
        return { ...state, cart: state.cart.map((i) => i.key === action.item.key ? { ...i, quantity: i.quantity + action.item.quantity } : i) };
      }
      return { ...state, cart: [...state.cart, action.item] };
    }
    case "CLEAR_CART":             return { ...state, cart: [] };
    case "SET_CUSTOMER_EMAIL":     return { ...state, customerEmail: action.email };
    case "SET_CUSTOMER_FIRST_NAME":return { ...state, customerFirstName: action.name };
    case "SET_CUSTOMER_LAST_NAME": return { ...state, customerLastName: action.name };
    case "SET_VIEW":               return { ...state, view: action.view };
    case "SET_PROCESSING":         return { ...state, isProcessing: action.isProcessing };
    case "SET_PAYMENT_INTENT":
      return { ...state, paymentIntentClientSecret: action.clientSecret, lastOrder: action.order, view: "checkout", isProcessing: false };
    case "PAYMENT_SUCCESS":
      return { ...state, view: "receipt", isProcessing: false };
    case "NEW_SALE":
      return { ...initial, products: state.products, loading: false };
    default:
      return state;
  }
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS: { id: POSTab; label: string }[] = [
  { id: "reader",    label: "Reader"    },
  { id: "keypad",    label: "Keypad"    },
  { id: "library",   label: "Library"   },
  { id: "favorites", label: "Favorites" },
];

// ─── Main component ───────────────────────────────────────────────────────────
export function POS() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Load products
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/pos/products");
        if (!res.ok) throw new Error("Failed to load products");
        const { products } = await res.json();
        dispatch({ type: "SET_PRODUCTS", products });
      } catch (err: any) {
        dispatch({ type: "SET_ERROR", error: err.message ?? "Unknown error" });
      }
    })();
  }, []);

  // Add a product+variant to cart
  const handleAdd = useCallback(
    (product: POSProduct, variant: POSVariant, qty: number) => {
      const key = `${product.id}::${variant.id}`;
      dispatch({
        type: "ADD_TO_CART",
        item: {
          key,
          product_id: product.id,
          variant_id: variant.id,
          product_title: product.title,
          variant_title: variant.title,
          sku: variant.sku,
          price_cents: variant.price_cents,
          image_url: product.image_url,
          quantity: qty,
        },
      });
    },
    []
  );

  // Add a custom keypad amount as a generic line item
  const handleKeypadCharge = useCallback(
    (amountCents: number, note: string) => {
      const key = `custom::${Date.now()}`;
      dispatch({
        type: "ADD_TO_CART",
        item: {
          key,
          product_id: "custom",
          variant_id: "custom",
          product_title: note || "Custom amount",
          variant_title: "",
          sku: null,
          price_cents: amountCents,
          image_url: null,
          quantity: 1,
        },
      });
    },
    []
  );

  // Initiate Stripe checkout
  const handleCharge = useCallback(async () => {
    if (!state.cart.length) return;
    dispatch({ type: "SET_PROCESSING", isProcessing: true });

    try {
      const res = await fetch("/api/pos/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: state.cart
            .filter((i) => i.product_id !== "custom")
            .map((item) => ({
              product_id: item.product_id,
              variant_id: item.variant_id,
              product_title: item.product_title,
              variant_title: item.variant_title,
              sku: item.sku,
              quantity: item.quantity,
              price_cents: item.price_cents,
            })),
          custom_items: state.cart
            .filter((i) => i.product_id === "custom")
            .map((i) => ({ label: i.product_title, amount_cents: i.price_cents })),
          customer_email: state.customerEmail.trim() || null,
          customer_first_name: state.customerFirstName.trim() || null,
          customer_last_name: state.customerLastName.trim() || null,
          discount_code: state.selectedDiscount?.code ?? null,
          discount_id: state.selectedDiscount?.id ?? null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        // json.error may be a string or { code, message } object
        const msg =
          typeof json.error === "string"
            ? json.error
            : json.error?.message ?? "Charge failed";
        throw new Error(msg);
      }

      dispatch({ type: "SET_CHARGE_ERROR", error: null });
      dispatch({
        type: "SET_PAYMENT_INTENT",
        clientSecret: json.payment_intent.client_secret,
        order: { ...json.order, discount_cents: json.order.discount_cents ?? 0 },
      });
    } catch (err: any) {
      dispatch({ type: "SET_PROCESSING", isProcessing: false });
      const msg = typeof err?.message === "string" ? err.message : JSON.stringify(err);
      dispatch({ type: "SET_CHARGE_ERROR", error: msg });
    }
  }, [state.cart, state.customerEmail, state.customerFirstName, state.customerLastName]);

  // ── Render guards ──────────────────────────────────────────────────────────
  if (state.loading) return <POSSkeleton />;

  if (state.error) {
    return (
      <div className="pos-error">
        <AlertCircle size={40} />
        <p>{state.error}</p>
        <button type="button" onClick={() => window.location.reload()}>
          <RotateCcw size={14} /> Retry
        </button>
      </div>
    );
  }

  if (state.view === "receipt" && state.lastOrder) {
    return (
      <Receipt
        orderNumber={state.lastOrder.order_number}
        items={state.cart}
        subtotalCents={state.cart.reduce((s, i) => s + i.price_cents * i.quantity, 0)}
        discountCents={state.lastOrder.discount_cents ?? 0}
        totalCents={state.lastOrder.total_cents}
        discountLabel={state.selectedDiscount?.label ?? state.selectedDiscount?.code ?? null}
        customerName={[state.customerFirstName, state.customerLastName].filter(Boolean).join(" ") || null}
        customerEmail={state.customerEmail || null}
        onNewSale={() => dispatch({ type: "NEW_SALE" })}
        printerConnection={state.printerConnection}
        onPrinterConnectionChange={(conn) => dispatch({ type: "SET_PRINTER_CONNECTION", connection: conn })}
        paperWidth={state.paperWidth}
        onPaperWidthChange={(w) => dispatch({ type: "SET_PAPER_WIDTH", width: w })}
      />
    );
  }

  if (state.view === "checkout" && state.paymentIntentClientSecret && state.lastOrder) {
    return (
      <Checkout
        items={state.cart}
        clientSecret={state.paymentIntentClientSecret}
        orderId={state.lastOrder.id}
        orderNumber={state.lastOrder.order_number}
        totalCents={state.lastOrder.total_cents}
        onBack={() => dispatch({ type: "SET_VIEW", view: "catalog" })}
        onSuccess={() => dispatch({ type: "PAYMENT_SUCCESS" })}
      />
    );
  }

  // ── Main catalog layout ────────────────────────────────────────────────────
  return (
    <div className="pos-root">

      {/* ── Left panel: Tabs + content ──────────────────────────────────────── */}
      <div className="pos-root__left">

        {/* Tab bar */}
        <nav className="pos-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={state.activeTab === tab.id}
              className={`pos-tabs__tab${state.activeTab === tab.id ? " pos-tabs__tab--active" : ""}`}
              onClick={() => dispatch({ type: "SET_TAB", tab: tab.id })}
            >
              {tab.label}
              {tab.id === "reader" && (
                <span className={`pos-tabs__reader-dot${state.readerConnected ? " pos-tabs__reader-dot--on" : ""}`} />
              )}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="pos-root__content">
          {state.activeTab === "reader" && (
            <CardReader
              onConnectionChange={(connected) =>
                dispatch({ type: "SET_READER_CONNECTED", connected })
              }
            />
          )}

          {state.activeTab === "keypad" && (
            <Keypad
              onCharge={handleKeypadCharge}
              isProcessing={state.isProcessing}
            />
          )}

          {state.activeTab === "library" && (
            <Library
              products={state.products}
              onSelect={(p) => dispatch({ type: "SELECT_PRODUCT", product: p })}
            />
          )}

          {state.activeTab === "favorites" && (
            <Favorites
              products={state.products}
              onSelect={(p) => dispatch({ type: "SELECT_PRODUCT", product: p })}
              onManage={() => dispatch({ type: "SET_TAB", tab: "library" })}
            />
          )}
        </div>
      </div>

      {/* ── Right panel: Cart (desktop/tablet) ─────────────────────────────── */}
      <div className="pos-root__right">
        <Cart
          items={state.cart}
          customerEmail={state.customerEmail}
          customerFirstName={state.customerFirstName}
          customerLastName={state.customerLastName}
          onQtyChange={(key, qty) => dispatch({ type: "SET_ITEM_QTY", key, qty })}
          onRemove={(key) => dispatch({ type: "REMOVE_FROM_CART", key })}
          onClear={() => dispatch({ type: "CLEAR_CART" })}
          onCharge={handleCharge}
          onEmailChange={(email) => dispatch({ type: "SET_CUSTOMER_EMAIL", email })}
          onFirstNameChange={(name) => dispatch({ type: "SET_CUSTOMER_FIRST_NAME", name })}
          onLastNameChange={(name) => dispatch({ type: "SET_CUSTOMER_LAST_NAME", name })}
          isProcessing={state.isProcessing}
          chargeError={state.chargeError}
          selectedDiscount={state.selectedDiscount}
          onDiscountChange={(d) => dispatch({ type: "SET_DISCOUNT", discount: d })}
        />
      </div>

      {/* ── Mobile cart drawer ───────────────────────────────────────────────── */}
      {/* Backdrop */}
      {mobileCartOpen && (
        <div
          className="pos-mobile-backdrop"
          aria-hidden
          onClick={() => setMobileCartOpen(false)}
        />
      )}

      {/* Sticky bottom bar — always visible on mobile */}
      <div className="pos-mobile-bar">
        <button
          type="button"
          className="pos-mobile-bar__btn"
          onClick={() => setMobileCartOpen((o) => !o)}
        >
          <span className="pos-mobile-bar__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {state.cart.reduce((s, i) => s + i.quantity, 0) > 0 && (
              <span className="pos-mobile-bar__badge">
                {state.cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </span>
          <span className="pos-mobile-bar__label">
            {state.cart.length === 0 ? "Cart empty" : `${state.cart.length} item${state.cart.length !== 1 ? "s" : ""}`}
          </span>
          <span className="pos-mobile-bar__total">
            ${(state.cart.reduce((s, i) => s + i.price_cents * i.quantity, 0) / 100).toFixed(2)}
          </span>
          <span className="pos-mobile-bar__chevron" style={{ transform: mobileCartOpen ? "rotate(180deg)" : undefined }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        </button>

        {/* Drawer — slides up from the bar */}
        <div className={`pos-mobile-drawer${mobileCartOpen ? " pos-mobile-drawer--open" : ""}`}>
          <div className="pos-mobile-drawer__handle" onClick={() => setMobileCartOpen(false)} />
          <Cart
            items={state.cart}
            customerEmail={state.customerEmail}
            customerFirstName={state.customerFirstName}
            customerLastName={state.customerLastName}
            onQtyChange={(key, qty) => dispatch({ type: "SET_ITEM_QTY", key, qty })}
            onRemove={(key) => dispatch({ type: "REMOVE_FROM_CART", key })}
            onClear={() => dispatch({ type: "CLEAR_CART" })}
            onCharge={() => { handleCharge(); setMobileCartOpen(false); }}
            onEmailChange={(email) => dispatch({ type: "SET_CUSTOMER_EMAIL", email })}
            onFirstNameChange={(name) => dispatch({ type: "SET_CUSTOMER_FIRST_NAME", name })}
            onLastNameChange={(name) => dispatch({ type: "SET_CUSTOMER_LAST_NAME", name })}
            isProcessing={state.isProcessing}
            chargeError={state.chargeError}
            selectedDiscount={state.selectedDiscount}
            onDiscountChange={(d) => dispatch({ type: "SET_DISCOUNT", discount: d })}
          />
        </div>
      </div>

      {/* Variant picker overlay */}
      <VariantPicker
        product={state.selectedProduct}
        onAdd={handleAdd}
        onClose={() => dispatch({ type: "SELECT_PRODUCT", product: null })}
      />
    </div>
  );
}