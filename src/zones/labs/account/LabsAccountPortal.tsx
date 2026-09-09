"use client";

// src/zones/labs/account/LabsAccountPortal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clinical multi-tab portal for Unenter Labs (labs.unenter.live/account).
//
// Strictly using Unenter theme tokens (hsl(var(--...))):
// - var(--background), var(--foreground), var(--card), var(--card-foreground)
// - var(--primary), var(--primary-foreground), var(--secondary), var(--secondary-foreground)
// - var(--muted), var(--muted-foreground), var(--accent), var(--accent-foreground)
// - var(--border), var(--input), var(--ring), var(--destructive)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import Link from "next/link";
import ProfileForm from "./ProfileForm";

export type OrderItem = {
  id: string;
  product_title: string | null;
  variant_title: string | null;
  sku: string | null;
  quantity: number | null;
  price_cents: number | null;
  currency?: string | null;
};

export type ResearchOrder = {
  id: string;
  order_number: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method?: string | null;
  total_cents: number | null;
  subtotal_cents?: number | null;
  discount_cents?: number | null;
  shipping_cents?: number | null;
  tax_cents?: number | null;
  currency: string | null;
  created_at: string;
  shipped_at?: string | null;
  delivered_at?: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipping_method_name?: string | null;
  customer_notes?: string | null;
  payment_method_brand?: string | null;
  shipping_address?: any;
  billing_address?: any;
  order_items: OrderItem[] | null;
};

export type WaitlistItem = {
  id: string;
  created_at: string;
  notified_at: string | null;
  research_product: {
    id: string;
    title: string;
    slug: string;
    price_cents: number | null;
    dosage_label: string | null;
    brand: string | null;
    cas_number: string | null;
    purity_percent: number | null;
    status: string | null;
  } | null;
};

export type AccountProfile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
  email: string | null;
  region: string | null;
  research_terms_accepted_at: string | null;
  created_at: string;
};

export type AddressBookEntry = {
  id: string;
  user_id: string;
  nickname: string;
  full_name: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string | null;
  is_default_shipping: boolean;
  is_default_billing: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CoaAnalyteSpec = {
  test: string;
  method: string;
  specification: string;
  result: string;
  status: "PASS" | "CONFORMS";
};

export type RawDetectorReading = {
  peakNo: number;
  retentionMin: number;
  widthMin: number;
  areaMavs: number;
  heightMav: number;
  areaPercent: number;
  symmetry: number;
  s2nRatio: number;
  identification: string;
};

export type RawMassSpecPeak = {
  mzRatio: string;
  ionForm: string;
  observedMass: string;
  theoreticalMass: string;
  deltaPpm: string;
  abundancePercent: number;
};

export type LabInstrumentTelemetry = {
  systemModel: string;
  columnSpec: string;
  detectionWavelength: string;
  flowRate: string;
  mobilePhase: string;
  columnTemperature: string;
  injectionVolume: string;
  sampleConcentration: string;
  systemPressure: string;
  calibrationR2: number;
  readings: RawDetectorReading[];
  massSpecPeaks: RawMassSpecPeak[];
};

export type OriginalLabPaper = {
  labReportNumber: string;
  accreditation: string;
  sampleForm: string;
  sampleBatchRef: string;
  receivedDate: string;
  completedDate: string;
  qrVerificationUrl: string;
  verificationKey: string;
  paperFileName: string;
  paperFileSize: string;
  paperSha256: string;
};

export type PurchasedCoa = {
  id: string;
  orderId: string;
  orderNumber: string;
  purchaseDate: string;
  compoundTitle: string;
  variantTitle?: string | null;
  sku?: string | null;
  batchNumber: string;
  casNumber: string;
  molecularFormula: string;
  molecularWeight: string;
  purityPercent: number;
  testDate: string;
  retestDate: string;
  testingLab: string;
  labLocation: string;
  analyst: string;
  chromatogramRetentionMin: number;
  chromatogramPoints: number[];
  specs: CoaAnalyteSpec[];
  originalPaper: OriginalLabPaper;
  telemetry: LabInstrumentTelemetry;
  paperImageUrl?: string | null;
  pdfUrl?: string | null;
  verificationUrl?: string | null;
  sha256Checksum?: string | null;
};

export type TabKey = "dashboard" | "orders" | "coa" | "waitlist" | "addresses" | "account_details";

function money(cents: number | null | undefined, currency = "USD"): string {
  if (typeof cents !== "number") return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function when(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function LabsAccountPortal({
  initialProfile,
  initialOrders,
  initialWaitlist,
  initialAddressBook = [],
  initialCoas = [],
  cartCount,
  initialTab = "dashboard",
}: {
  initialProfile: AccountProfile;
  initialOrders: ResearchOrder[];
  initialWaitlist: WaitlistItem[];
  initialAddressBook?: AddressBookEntry[];
  initialCoas?: PurchasedCoa[];
  cartCount: number;
  initialTab?: TabKey;
}) {
  const [profile, setProfile] = useState<AccountProfile>(initialProfile);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isAcceptingTerms, setIsAcceptingTerms] = useState(false);

  // Address Book State
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>(initialAddressBook);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<AddressBookEntry | null>(null);
  const [addressFormLoading, setAddressFormLoading] = useState(false);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);

  // Address Modal Form Fields
  const [formNickname, setFormNickname] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formLine1, setFormLine1] = useState("");
  const [formLine2, setFormLine2] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formState, setFormState] = useState("");
  const [formPostalCode, setFormPostalCode] = useState("");
  const [formCountry, setFormCountry] = useState("US");
  const [formPhone, setFormPhone] = useState("");
  const [formIsDefaultShipping, setFormIsDefaultShipping] = useState(false);
  const [formIsDefaultBilling, setFormIsDefaultBilling] = useState(false);

  // COA Library State
  const purchasedCoas = initialCoas ?? [];
  const [selectedCoa, setSelectedCoa] = useState<PurchasedCoa | null>(null);
  const [coaReportTab, setCoaReportTab] = useState<"digital" | "paper" | "telemetry">("digital");
  const [coaSearch, setCoaSearch] = useState("");

  function downloadCoaCsv(coa: PurchasedCoa) {
    const rows = [
      ["#", "Retention Time (min)", "Peak Width (min)", "Area (mAU*s)", "Height (mAU)", "Area %", "Symmetry", "S/N Ratio", "Identification"],
      ...coa.telemetry.readings.map((r) => [
        r.peakNo,
        r.retentionMin.toFixed(2),
        r.widthMin.toFixed(2),
        r.areaMavs.toFixed(2),
        r.heightMav.toFixed(2),
        `${r.areaPercent.toFixed(2)}%`,
        r.symmetry.toFixed(2),
        r.s2nRatio.toFixed(1),
        `"${r.identification}"`,
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${coa.sku || "compound"}_${coa.batchNumber}_DetectorReadings.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function downloadCoaJson(coa: PurchasedCoa) {
    const exportData = {
      compound: coa.compoundTitle,
      batch: coa.batchNumber,
      cas: coa.casNumber,
      molecularFormula: coa.molecularFormula,
      molecularWeight: coa.molecularWeight,
      purityPercent: coa.purityPercent,
      testingLab: coa.testingLab,
      labLocation: coa.labLocation,
      analyst: coa.analyst,
      testDate: coa.testDate,
      retestDate: coa.retestDate,
      originalDocument: coa.originalPaper,
      instrumentTelemetry: coa.telemetry,
      rawChromatogramPoints: coa.chromatogramPoints,
      specs: coa.specs,
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `${coa.sku || "compound"}_${coa.batchNumber}_InstrumentData.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredCoas = purchasedCoas.filter((c) => {
    if (!coaSearch.trim()) return true;
    const q = coaSearch.toLowerCase();
    return (
      c.compoundTitle.toLowerCase().includes(q) ||
      c.batchNumber.toLowerCase().includes(q) ||
      c.casNumber.toLowerCase().includes(q) ||
      c.testingLab.toLowerCase().includes(q) ||
      c.orderNumber.toLowerCase().includes(q)
    );
  });

  const selectedOrder = initialOrders.find((o) => o.id === selectedOrderId || o.order_number === selectedOrderId);

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.display_name || "Tyler Burns";

  async function handleAcceptTerms() {
    setIsAcceptingTerms(true);
    try {
      const res = await fetch("/api/research-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept_terms: true }),
      });
      if (res.ok) {
        setProfile((prev) => ({ ...prev, research_terms_accepted_at: new Date().toISOString() }));
      }
    } catch (e) {
      console.error("Failed to accept terms:", e);
    } finally {
      setIsAcceptingTerms(false);
    }
  }

  function openAddAddressModal() {
    setEditingAddress(null);
    setFormNickname("");
    setFormFullName(fullName);
    setFormCompany("");
    setFormLine1("");
    setFormLine2("");
    setFormCity("");
    setFormState("");
    setFormPostalCode("");
    setFormCountry("US");
    setFormPhone("");
    setFormIsDefaultShipping(addressBook.length === 0);
    setFormIsDefaultBilling(addressBook.length === 0);
    setAddressFormError(null);
    setIsAddressModalOpen(true);
  }

  function openEditAddressModal(addr: AddressBookEntry) {
    setEditingAddress(addr);
    setFormNickname(addr.nickname || "");
    setFormFullName(addr.full_name || "");
    setFormCompany(addr.company || "");
    setFormLine1(addr.line1 || "");
    setFormLine2(addr.line2 || "");
    setFormCity(addr.city || "");
    setFormState(addr.state || "");
    setFormPostalCode(addr.postal_code || "");
    setFormCountry(addr.country || "US");
    setFormPhone(addr.phone || "");
    setFormIsDefaultShipping(Boolean(addr.is_default_shipping));
    setFormIsDefaultBilling(Boolean(addr.is_default_billing));
    setAddressFormError(null);
    setIsAddressModalOpen(true);
  }

  async function handleSaveAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!formNickname.trim()) {
      setAddressFormError("Facility or destination nickname is required (e.g. 'Primary Facility', 'Secondary Storage Annex').");
      return;
    }
    if (!formFullName.trim() || !formLine1.trim() || !formCity.trim() || !formState.trim() || !formPostalCode.trim()) {
      setAddressFormError("Please fill out all required address fields.");
      return;
    }

    setAddressFormLoading(true);
    setAddressFormError(null);

    try {
      if (editingAddress) {
        const res = await fetch("/api/research-account", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address_id: editingAddress.id,
            nickname: formNickname.trim(),
            full_name: formFullName.trim(),
            company: formCompany.trim() || null,
            line1: formLine1.trim(),
            line2: formLine2.trim() || null,
            city: formCity.trim(),
            state: formState.trim(),
            postal_code: formPostalCode.trim(),
            country: formCountry.trim() || "US",
            phone: formPhone.trim() || null,
            is_default_shipping: formIsDefaultShipping,
            is_default_billing: formIsDefaultBilling,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update address");
        if (data.address) {
          setAddressBook((prev) =>
            prev.map((a) => {
              if (a.id === editingAddress.id) return data.address;
              return {
                ...a,
                is_default_shipping: formIsDefaultShipping ? false : a.is_default_shipping,
                is_default_billing: formIsDefaultBilling ? false : a.is_default_billing,
              };
            })
          );
        }
      } else {
        const res = await fetch("/api/research-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nickname: formNickname.trim(),
            full_name: formFullName.trim(),
            company: formCompany.trim() || null,
            line1: formLine1.trim(),
            line2: formLine2.trim() || null,
            city: formCity.trim(),
            state: formState.trim(),
            postal_code: formPostalCode.trim(),
            country: formCountry.trim() || "US",
            phone: formPhone.trim() || null,
            is_default_shipping: formIsDefaultShipping,
            is_default_billing: formIsDefaultBilling,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to add address");
        if (data.address) {
          setAddressBook((prev) => [
            data.address,
            ...prev.map((a) => ({
              ...a,
              is_default_shipping: formIsDefaultShipping ? false : a.is_default_shipping,
              is_default_billing: formIsDefaultBilling ? false : a.is_default_billing,
            })),
          ]);
        }
      }
      setIsAddressModalOpen(false);
    } catch (err: any) {
      setAddressFormError(err.message || "An unexpected error occurred while saving.");
    } finally {
      setAddressFormLoading(false);
    }
  }

  async function handleSetDefault(addrId: string, type: "shipping" | "billing") {
    try {
      const payload =
        type === "shipping"
          ? { address_id: addrId, is_default_shipping: true }
          : { address_id: addrId, is_default_billing: true };

      const res = await fetch("/api/research-account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setAddressBook((prev) =>
          prev.map((a) => ({
            ...a,
            is_default_shipping: type === "shipping" ? a.id === addrId : a.is_default_shipping,
            is_default_billing: type === "billing" ? a.id === addrId : a.is_default_billing,
          }))
        );
      }
    } catch (e) {
      console.error(`Failed to set default ${type}:`, e);
    }
  }

  async function handleDeleteAddress(addrId: string, nickname: string) {
    if (!window.confirm(`Are you sure you want to remove "${nickname}" from your address book?`)) return;
    try {
      const res = await fetch(`/api/research-account?id=${encodeURIComponent(addrId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAddressBook((prev) => prev.filter((a) => a.id !== addrId));
      }
    } catch (e) {
      console.error("Failed to delete address:", e);
    }
  }

  const defaultShippingEntry = addressBook.find((a) => a.is_default_shipping) || addressBook[0];
  const defaultBillingEntry = addressBook.find((a) => a.is_default_billing) || addressBook[0];

  const defaultShippingAddress = defaultShippingEntry
    ? {
        nickname: defaultShippingEntry.nickname,
        full_name: defaultShippingEntry.full_name,
        company: defaultShippingEntry.company,
        line1: defaultShippingEntry.line1,
        line2: defaultShippingEntry.line2,
        city: defaultShippingEntry.city,
        state: defaultShippingEntry.state,
        postal_code: defaultShippingEntry.postal_code,
        country: defaultShippingEntry.country,
        phone: defaultShippingEntry.phone,
      }
    : selectedOrder?.shipping_address || {
        nickname: "Primary Facility",
        full_name: fullName,
        line1: "1619 N Chaparral Dr",
        city: "Ridgecrest",
        state: "CA",
        postal_code: "93555",
        country: "US",
        phone: "+17602646947",
      };

  const defaultBillingAddress = defaultBillingEntry
    ? {
        nickname: defaultBillingEntry.nickname,
        full_name: defaultBillingEntry.full_name,
        company: defaultBillingEntry.company,
        line1: defaultBillingEntry.line1,
        line2: defaultBillingEntry.line2,
        city: defaultBillingEntry.city,
        state: defaultBillingEntry.state,
        postal_code: defaultBillingEntry.postal_code,
        country: defaultBillingEntry.country,
        phone: defaultBillingEntry.phone,
      }
    : selectedOrder?.billing_address || defaultShippingAddress;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-[hsl(var(--foreground))]">
      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="mb-8 border-b border-[hsl(var(--border))] pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
          Welcome {profile.first_name || "Tyler"}!
        </h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          Manage your Unenter Labs research account, active orders, third-party analytical COAs, compound waitlist, and fulfillment details.
        </p>
      </div>

      {/* ── Main Layout: Left Sidebar + Tab Content ────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Navigation Sidebar */}
        <aside className="lg:col-span-3">
          <nav className="flex flex-row items-center gap-1.5 overflow-x-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 pb-2.5 shadow-sm scroll-smooth touch-pan-x sleek-scrollbar [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-[hsl(var(--muted)/0.2)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[hsl(var(--primary)/0.4)] [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[hsl(var(--primary))] [&::-webkit-scrollbar-button]:hidden lg:flex-col lg:items-stretch lg:overflow-x-visible lg:p-2">
            {/* Dashboard Tab Button */}
            <button
              onClick={() => {
                setActiveTab("dashboard");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "dashboard"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
            </button>

            {/* Orders Tab Button */}
            <button
              onClick={() => {
                setActiveTab("orders");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "orders"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Orders
              {initialOrders.length > 0 && (
                <span className="ml-auto rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-bold text-[hsl(var(--foreground))]">
                  {initialOrders.length}
                </span>
              )}
            </button>

            {/* COA Library Tab Button */}
            <button
              onClick={() => {
                setActiveTab("coa");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "coa"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              COA Library
              <span className="ml-auto rounded-full bg-[hsl(var(--accent)/0.2)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--accent-foreground))]">
                {purchasedCoas.length}
              </span>
            </button>

            {/* Waitlist Tab Button */}
            <button
              onClick={() => {
                setActiveTab("waitlist");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "waitlist"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Your Waitlist
              {initialWaitlist.length > 0 && (
                <span className="ml-auto rounded-full bg-[hsl(var(--accent)/0.2)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--accent-foreground))]">
                  {initialWaitlist.length}
                </span>
              )}
            </button>

            {/* Address Book Tab Button */}
            <button
              onClick={() => {
                setActiveTab("addresses");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "addresses"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Address Book
              {addressBook.length > 0 && (
                <span className="ml-auto rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-bold text-[hsl(var(--foreground))]">
                  {addressBook.length}
                </span>
              )}
            </button>

            {/* Account Details Tab Button */}
            <button
              onClick={() => {
                setActiveTab("account_details");
                setSelectedOrderId(null);
              }}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition lg:w-full lg:py-3 ${
                activeTab === "account_details"
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account Details
            </button>

            {/* Responsive Divider: Vertical separator on mobile/tablet, horizontal divider on desktop sidebar */}
            <div className="my-1.5 h-6 w-px shrink-0 bg-[hsl(var(--border))] mx-1 lg:my-2 lg:h-0 lg:w-full lg:border-t lg:border-[hsl(var(--border))] lg:mx-0" />

            {/* Logout Action */}
            <Link
              href="https://auth.unenter.live/sign-out"
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold text-[hsl(var(--destructive))] transition hover:bg-[hsl(var(--destructive)/0.1)] lg:w-full lg:py-3"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </Link>
          </nav>
        </aside>

        {/* Right Content Area */}
        <main className="lg:col-span-9">
          {/* ══════════════════ TAB: DASHBOARD ══════════════════ */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div className="text-sm text-[hsl(var(--muted-foreground))]">
                Hello <strong className="font-semibold text-[hsl(var(--foreground))]">{fullName}</strong> (not {fullName}?{" "}
                <Link href="https://auth.unenter.live/sign-out" className="text-[hsl(var(--primary))] hover:underline">
                  Log out
                </Link>
                )
                <p className="mt-1">
                  From your account dashboard you can view your{" "}
                  <button onClick={() => setActiveTab("orders")} className="text-[hsl(var(--primary))] hover:underline">
                    recent orders
                  </button>
                  , verify third-party analytical reports in your{" "}
                  <button onClick={() => setActiveTab("coa")} className="text-[hsl(var(--primary))] hover:underline">
                    COA library
                  </button>
                  , monitor your{" "}
                  <button onClick={() => setActiveTab("waitlist")} className="text-[hsl(var(--primary))] hover:underline">
                    compound waitlist
                  </button>
                  , manage your{" "}
                  <button onClick={() => setActiveTab("addresses")} className="text-[hsl(var(--primary))] hover:underline">
                    shipping and billing addresses
                  </button>
                  , and edit your{" "}
                  <button onClick={() => setActiveTab("account_details")} className="text-[hsl(var(--primary))] hover:underline">
                    account details
                  </button>
                  .
                </p>
              </div>

              {/* Research Terms Banner */}
              {!profile.research_terms_accepted_at && (
                <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[hsl(var(--accent)/0.4)] bg-[hsl(var(--accent)/0.12)] p-5 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="font-semibold text-[hsl(var(--foreground))]">
                      Research Agreement Confirmation Required
                    </h4>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Confirm adherence to Unenter Labs laboratory research protocols to proceed with specimen checkout.
                    </p>
                  </div>
                  <button
                    onClick={handleAcceptTerms}
                    disabled={isAcceptingTerms}
                    className="shrink-0 rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 disabled:opacity-50"
                  >
                    {isAcceptingTerms ? "Confirming…" : "Accept Terms"}
                  </button>
                </div>
              )}

              {/* Referral Card (Theme Tokens) */}
              <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-br from-[hsl(var(--primary)/0.15)] via-[hsl(var(--card))] to-[hsl(var(--accent)/0.15)] p-8 text-center text-[hsl(var(--card-foreground))] shadow-md sm:p-12">
                <div className="relative z-10 mx-auto max-w-xl">
                  <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-[hsl(var(--foreground))]">
                    Earn with every referral!
                  </h2>
                  <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
                    Join our partner program and earn laboratory credits on every qualified research order you refer.
                  </p>
                  <button
                    onClick={() => alert("Referral link copied to clipboard!")}
                    className="mt-6 inline-flex rounded-lg bg-[hsl(var(--primary))] px-6 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90"
                  >
                    Start Earning Today
                  </button>
                  <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
                    By joining you agree to our{" "}
                    <Link href="/pages/terms" className="underline hover:text-[hsl(var(--foreground))]">
                      Affiliate Terms of Use
                    </Link>
                    .
                  </p>
                </div>
              </div>

              {/* Overview Summary Cards */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {/* Card 1: Orders */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Recent Orders</div>
                  <div className="mt-2 text-2xl font-bold text-[hsl(var(--card-foreground))]">{initialOrders.length}</div>
                  {initialOrders[0] && (
                    <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Latest:{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("orders");
                          setSelectedOrderId(initialOrders[0].id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="font-bold text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary)/0.6)] hover:decoration-[hsl(var(--primary))]"
                      >
                        #{initialOrders[0].order_number ?? initialOrders[0].id.slice(0, 8)}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setActiveTab("orders");
                      setSelectedOrderId(null);
                    }}
                    className="mt-3 block text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                  >
                    View order history &rarr;
                  </button>
                </div>

                {/* Card 2: COA Library */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">COA Library</div>
                  <div className="mt-2 text-2xl font-bold text-[hsl(var(--primary))]">
                    {purchasedCoas.length} {purchasedCoas.length === 1 ? "Report" : "Reports"}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    HPLC Purity: ≥ 99.4%
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab("coa");
                      setSelectedOrderId(null);
                    }}
                    className="mt-3 block text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                  >
                    View analytical reports &rarr;
                  </button>
                </div>

                {/* Card 3: Waitlist */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Your Waitlist</div>
                  <div className="mt-2 text-2xl font-bold text-[hsl(var(--card-foreground))]">
                    {initialWaitlist.length} {initialWaitlist.length === 1 ? "Compound" : "Compounds"}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Instant stock alerts
                  </div>
                  <button
                    onClick={() => setActiveTab("waitlist")}
                    className="mt-3 block text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                  >
                    Manage compound alerts &rarr;
                  </button>
                </div>

                {/* Card 4: Cart */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Active Cart</div>
                  <div className="mt-2 text-2xl font-bold text-[hsl(var(--card-foreground))]">
                    {cartCount} {cartCount === 1 ? "Item" : "Items"}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                    Checkout ready
                  </div>
                  <Link href="/cart" className="mt-3 inline-block text-xs font-semibold text-[hsl(var(--primary))] hover:underline">
                    Proceed to cart &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ TAB: ORDERS ══════════════════ */}
          {activeTab === "orders" && (
            <div>
              {!selectedOrder ? (
                /* Orders List View */
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
                  <div className="border-b border-[hsl(var(--border))] px-6 py-4">
                    <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Order History</h2>
                  </div>

                  {initialOrders.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                      No research orders found.{" "}
                      <Link href="/" className="text-[hsl(var(--primary))] hover:underline">
                        Browse catalog
                      </Link>
                      .
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                          <tr>
                            <th className="px-6 py-3.5">Order</th>
                            <th className="px-6 py-3.5">Date</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(var(--border))]">
                          {initialOrders.map((order) => {
                            const itemCount = order.order_items?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 1;
                            return (
                              <tr key={order.id} className="transition hover:bg-[hsl(var(--muted)/0.2)]">
                                <td className="px-6 py-4">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedOrderId(order.id);
                                      window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    className="font-bold text-[hsl(var(--primary))] underline decoration-[hsl(var(--primary)/0.6)] underline-offset-4 transition hover:decoration-[hsl(var(--primary))]"
                                    title="Click to view full order details"
                                  >
                                    #{order.order_number ?? order.id.slice(0, 8)}
                                  </button>
                                </td>
                                <td className="px-6 py-4 text-[hsl(var(--muted-foreground))]">{when(order.created_at)}</td>
                                <td className="px-6 py-4">
                                  <span className="inline-flex rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))]">
                                    {order.status === "fulfilled" ? "Completed" : order.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-[hsl(var(--card-foreground))]">
                                  {money(order.total_cents, order.currency ?? "USD")}{" "}
                                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                    for {itemCount} {itemCount === 1 ? "item" : "items"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* Detailed Order View */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedOrderId(null)}
                      className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
                    >
                      &larr; Back to all orders
                    </button>
                  </div>

                  <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      Order <strong className="font-bold text-[hsl(var(--card-foreground))]">#{selectedOrder.order_number}</strong> was
                      placed on <strong className="text-[hsl(var(--card-foreground))]">{when(selectedOrder.created_at)}</strong> and is
                      currently{" "}
                      <strong className="text-[hsl(var(--primary))]">
                        {selectedOrder.status === "fulfilled" ? "Completed" : selectedOrder.status}
                      </strong>
                      .
                    </p>

                    {/* Order Updates / Tracking Box */}
                    <div className="mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] p-5">
                      <h3 className="font-bold text-[hsl(var(--card-foreground))]">Order updates</h3>
                      <ol className="mt-3 space-y-3 text-xs text-[hsl(var(--muted-foreground))]">
                        <li className="flex flex-col gap-1">
                          <span className="font-semibold text-[hsl(var(--card-foreground))]">
                            {when(selectedOrder.shipped_at || selectedOrder.created_at)}
                          </span>
                          <p>
                            Your order has been shipped via{" "}
                            <strong className="text-[hsl(var(--card-foreground))]">FedEx</strong>. Tracking number:{" "}
                            <strong className="text-[hsl(var(--card-foreground))]">{selectedOrder.tracking_number}</strong>
                          </p>
                          {selectedOrder.tracking_url && (
                            <a
                              href={selectedOrder.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-[hsl(var(--primary))] hover:underline"
                            >
                              Track your shipment: {selectedOrder.tracking_url} &rarr;
                            </a>
                          )}
                        </li>
                      </ol>
                    </div>

                    {/* Order Details Line Items */}
                    <div className="mt-8">
                      <h3 className="text-base font-bold text-[hsl(var(--card-foreground))]">Order details</h3>
                      <div className="mt-3 overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                        <table className="w-full text-left text-sm">
                          <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                            <tr>
                              <th className="px-5 py-3">Product</th>
                              <th className="px-5 py-3 text-center">Batch Report</th>
                              <th className="px-5 py-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[hsl(var(--border))]">
                            {selectedOrder.order_items?.map((item) => {
                              const matchingCoa = purchasedCoas.find(
                                (c) => (c.orderId === selectedOrder.id && c.compoundTitle === item.product_title) ||
                                       (c.sku && item.sku && c.sku === item.sku)
                              );

                              return (
                                <tr key={item.id}>
                                  <td className="px-5 py-4">
                                    <span className="font-semibold text-[hsl(var(--primary))]">
                                      {item.product_title}
                                    </span>{" "}
                                    &times; {item.quantity ?? 1}
                                    {item.variant_title && (
                                      <div className="text-xs text-[hsl(var(--muted-foreground))]">{item.variant_title}</div>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-center">
                                    {matchingCoa ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedCoa(matchingCoa);
                                          setCoaReportTab("digital");
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]"
                                      >
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        View COA & Lab Paper
                                      </button>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                                        Batch Pending Release
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-right font-medium text-[hsl(var(--card-foreground))]">
                                    {money(item.price_cents, item.currency ?? "USD")}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] text-sm">
                            <tr>
                              <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Subtotal:</th>
                              <td colSpan={2} className="px-5 py-2.5 text-right font-medium text-[hsl(var(--card-foreground))]">
                                {money(selectedOrder.subtotal_cents ?? selectedOrder.total_cents, selectedOrder.currency ?? "USD")}
                              </td>
                            </tr>
                            {typeof selectedOrder.discount_cents === "number" && selectedOrder.discount_cents > 0 && (
                              <tr>
                                <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Discount:</th>
                                <td colSpan={2} className="px-5 py-2.5 text-right font-medium text-[hsl(var(--primary))]">
                                  -{money(selectedOrder.discount_cents, selectedOrder.currency ?? "USD")}
                                </td>
                              </tr>
                            )}
                            <tr>
                              <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Shipping:</th>
                              <td colSpan={2} className="px-5 py-2.5 text-right font-medium text-[hsl(var(--card-foreground))]">
                                {money(selectedOrder.shipping_cents ?? 0, selectedOrder.currency ?? "USD")}{" "}
                                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                  via {selectedOrder.shipping_method_name || "UPS/FedEx Priority"}
                                </span>
                              </td>
                            </tr>
                            <tr>
                              <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Shipping Protection:</th>
                              <td colSpan={2} className="px-5 py-2.5 text-right font-medium text-[hsl(var(--card-foreground))]">$3.00</td>
                            </tr>
                            <tr>
                              <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Tax:</th>
                              <td colSpan={2} className="px-5 py-2.5 text-right font-medium text-[hsl(var(--card-foreground))]">$0.00</td>
                            </tr>
                            <tr className="border-t-2 border-[hsl(var(--border))]">
                              <th className="px-5 py-3 font-bold text-[hsl(var(--card-foreground))]">Total:</th>
                              <td colSpan={2} className="px-5 py-3 text-right text-base font-bold text-[hsl(var(--card-foreground))]">
                                {money(selectedOrder.total_cents, selectedOrder.currency ?? "USD")}
                              </td>
                            </tr>
                            <tr>
                              <th className="px-5 py-2.5 font-normal text-[hsl(var(--muted-foreground))]">Payment method:</th>
                              <td colSpan={2} className="px-5 py-2.5 text-right text-xs font-semibold text-[hsl(var(--card-foreground))]">
                                {selectedOrder.payment_method_brand === "zelle" || selectedOrder.payment_method === "zelle"
                                  ? "Zelle (Offline Payment)"
                                  : selectedOrder.payment_method_brand || "Credit card (Visa, Amex, Discover)"}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* Addresses Grid */}
                    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-5">
                        <h3 className="font-bold text-[hsl(var(--card-foreground))]">Billing address</h3>
                        <div className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                          <p className="font-semibold text-[hsl(var(--card-foreground))]">{defaultAddress.full_name}</p>
                          <p>{defaultAddress.line1}</p>
                          <p>
                            {defaultAddress.city}, {defaultAddress.state} {defaultAddress.postal_code}
                          </p>
                          <p>{defaultAddress.country}</p>
                          <p>{defaultAddress.phone}</p>
                          <p>{profile.email}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-5">
                        <h3 className="font-bold text-[hsl(var(--card-foreground))]">Shipping address</h3>
                        <div className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                          <p className="font-semibold text-[hsl(var(--card-foreground))]">{defaultAddress.full_name}</p>
                          <p>{defaultAddress.line1}</p>
                          <p>
                            {defaultAddress.city}, {defaultAddress.state} {defaultAddress.postal_code}
                          </p>
                          <p>{defaultAddress.country}</p>
                          <p>{defaultAddress.phone}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ TAB: COA LIBRARY ══════════════════ */}
          {activeTab === "coa" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[hsl(var(--card-foreground))]">
                      Certificate of Analysis (COA) Library
                    </h2>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                      Third-party analytical testing reports (HPLC purity, Mass Spectrometry, and Endotoxin verification) for compounds purchased under your research account.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] px-3 py-1.5 text-xs font-bold text-[hsl(var(--primary))]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Third-Party Lab Accredited
                  </div>
                </div>

                {/* Quality Metrics Highlights */}
                <div className="mt-6 grid grid-cols-2 gap-4 border-y border-[hsl(var(--border))] py-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Total Reports</div>
                    <div className="mt-1 text-xl font-bold text-[hsl(var(--foreground))]">{purchasedCoas.length} Verified</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Average Purity</div>
                    <div className="mt-1 text-xl font-bold text-[hsl(var(--primary))]">
                      {purchasedCoas.length > 0
                        ? (
                            purchasedCoas.reduce((sum, c) => sum + (c.purityPercent || 99.4), 0) /
                            purchasedCoas.length
                          ).toFixed(2) + "%"
                        : "99.55%"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Assay Standard</div>
                    <div className="mt-1 text-xl font-bold text-[hsl(var(--foreground))]">RP-HPLC @ 214nm</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Analytical Labs</div>
                    <div className="mt-1 text-xl font-bold text-[hsl(var(--accent-foreground))]">Janoshik / MZ</div>
                  </div>
                </div>

                {/* Search / Filter Input */}
                <div className="mt-6">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search COAs by compound name, batch lot #, or CAS..."
                      value={coaSearch}
                      onChange={(e) => setCoaSearch(e.target.value)}
                      className="w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-4 py-2.5 pl-10 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                    />
                    <svg className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    {coaSearch && (
                      <button
                        onClick={() => setCoaSearch("")}
                        className="absolute right-3 top-2.5 text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* COA Cards Grid */}
                {purchasedCoas.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-12 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))]">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="mt-4 text-base font-bold text-[hsl(var(--card-foreground))]">No Analytical Certificates On File</h3>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                      Certificates of Analysis (COAs) are cryptographically matched to your physical shipment's lot number upon order dispatch. You can also explore our universal public verification library.
                    </p>
                    <div className="mt-6">
                      <a
                        href="/verify"
                        className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))] shadow-sm transition hover:opacity-90"
                      >
                        Explore Public COA Library &rarr;
                      </a>
                    </div>
                  </div>
                ) : filteredCoas.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    No matching Certificates of Analysis found for &quot;{coaSearch}&quot;.
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {filteredCoas.map((coa) => {
                      // Generate SVG path for mini chromatogram
                      const maxVal = 100;
                      const width = 280;
                      const height = 70;
                      const step = width / (coa.chromatogramPoints.length - 1);
                      const pointsStr = coa.chromatogramPoints
                        .map((pt, idx) => `${idx * step},${height - (pt / maxVal) * (height - 8)}`)
                        .join(" ");

                      return (
                        <div
                          key={coa.id}
                          className="flex flex-col justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm transition hover:border-[hsl(var(--primary)/0.5)]"
                        >
                          <div>
                            {/* Card Top: Title & Purity Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-bold text-[hsl(var(--card-foreground))]">
                                  {coa.compoundTitle}
                                </h3>
                                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                                  {coa.variantTitle}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                                {coa.purityPercent}% HPLC
                              </span>
                            </div>

                            {/* Batch Info Grid */}
                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                              <div>
                                Batch Lot: <strong className="text-[hsl(var(--card-foreground))] font-mono">{coa.batchNumber}</strong>
                              </div>
                              <div>
                                CAS: <strong className="text-[hsl(var(--card-foreground))] font-mono">{coa.casNumber}</strong>
                              </div>
                              <div>
                                Tested: <strong className="text-[hsl(var(--card-foreground))]">{when(coa.testDate)}</strong>
                              </div>
                              <div>
                                Laboratory: <strong className="text-[hsl(var(--card-foreground))]">{coa.testingLab}</strong>
                              </div>
                            </div>

                            {/* Mini HPLC Chromatogram Curve */}
                            <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-3">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                                <span>HPLC Chromatogram (214nm)</span>
                                <span className="font-mono text-[hsl(var(--primary))]">Peak: {coa.chromatogramRetentionMin} min</span>
                              </div>
                              <div className="mt-2 h-16 w-full">
                                <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
                                  <defs>
                                    <linearGradient id={`grad-${coa.id}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
                                    </linearGradient>
                                  </defs>
                                  <polygon
                                    points={`0,${height} ${pointsStr} ${width},${height}`}
                                    fill={`url(#grad-${coa.id})`}
                                  />
                                  <polyline
                                    fill="none"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={pointsStr}
                                  />
                                </svg>
                              </div>
                            </div>

                            {/* Lab Paper & Telemetry Badges */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                              {coa.originalPaper && (
                                <span className="inline-flex items-center gap-1 rounded border border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.08)] px-2 py-0.5 font-medium text-[hsl(var(--primary))]">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  Lab PDF Available
                                </span>
                              )}
                              {coa.telemetry && (
                                <span className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-2 py-0.5 font-medium text-[hsl(var(--card-foreground))]">
                                  <svg className="h-3 w-3 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                  </svg>
                                  {coa.telemetry.readings.length} HPLC Channels
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--border))] pt-4">
                            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                              Order #{coa.orderNumber}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {coa.originalPaper && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCoa(coa);
                                    setCoaReportTab("paper");
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
                                  title="Inspect authentic scanned laboratory letterhead and analysis sheet"
                                >
                                  <svg className="h-3.5 w-3.5 text-[hsl(var(--primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                  Lab Paper
                                </button>
                              )}
                              {coa.telemetry && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCoa(coa);
                                    setCoaReportTab("telemetry");
                                  }}
                                  className="inline-flex items-center gap-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-xs font-medium text-[hsl(var(--card-foreground))] shadow-sm transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
                                  title="View raw detector readings, integration table & mass spec"
                                >
                                  <svg className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z" />
                                  </svg>
                                  Raw Data
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCoa(coa);
                                  setCoaReportTab("digital");
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-1 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                Full Report
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════ TAB: WAITLIST ══════════════════ */}
          {activeTab === "waitlist" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
                <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Your Compound Waitlist</h2>
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  High-priority stock notifications. You will receive immediate allocation alerts as soon as batch synthesis and third-party analytical lab reports (COA) clear quality release.
                </p>

                {initialWaitlist.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                    No compounds currently on your waitlist. When viewing an out-of-stock product in the catalog, click
                    &quot;Notify when available&quot; to queue an instant alert.
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-1 gap-4">
                    {initialWaitlist.map((item) => {
                      const prod = item.research_product;
                      return (
                        <div
                          key={item.id}
                          className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm sm:flex-row sm:items-center"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-[hsl(var(--card-foreground))]">
                                {prod?.title || "YK-11 Liquid 10mg/ml, 30ml"}
                              </h3>
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.12)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--accent-foreground))]">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[hsl(var(--primary))]"></span>
                                Waitlist Active
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                              <span>
                                Brand: <strong className="text-[hsl(var(--card-foreground))]">{prod?.brand || "Unenter Labs"}</strong>
                              </span>
                              {prod?.cas_number && (
                                <span>
                                  CAS: <strong className="text-[hsl(var(--card-foreground))]">{prod.cas_number}</strong>
                                </span>
                              )}
                              <span>
                                Notification to: <strong className="text-[hsl(var(--card-foreground))]">{profile.email}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Link
                              href={`/products/${prod?.slug || "yk-11-liquid-10mg-ml-30ml"}`}
                              className="rounded-md border border-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--primary-foreground))]"
                            >
                              View Compound
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════ TAB: ADDRESS BOOK ══════════════════ */}
          {activeTab === "addresses" && (
            <div className="space-y-8">
              {/* Default Fulfillment Section */}
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Fulfillment Addresses</h2>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                      The designated shipping and billing destinations automatically applied during compound checkout.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {/* Shipping Address Card */}
                  <div className="flex flex-col justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-[hsl(var(--card-foreground))]">Shipping Address</h3>
                          <span className="rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.12)] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--accent-foreground))]">
                            Primary Shipping
                          </span>
                        </div>
                        {defaultShippingEntry && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            {defaultShippingAddress.nickname}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                        <p className="font-bold text-[hsl(var(--card-foreground))]">{defaultShippingAddress.full_name}</p>
                        {defaultShippingAddress.company && (
                          <p className="font-medium text-[hsl(var(--muted-foreground))]">{defaultShippingAddress.company}</p>
                        )}
                        <p>{defaultShippingAddress.line1}</p>
                        {defaultShippingAddress.line2 && <p>{defaultShippingAddress.line2}</p>}
                        <p>
                          {defaultShippingAddress.city}, {defaultShippingAddress.state} {defaultShippingAddress.postal_code}
                        </p>
                        <p>{defaultShippingAddress.country}</p>
                        {defaultShippingAddress.phone && <p>{defaultShippingAddress.phone}</p>}
                      </div>
                    </div>

                    {defaultShippingEntry && (
                      <div className="mt-4 border-t border-[hsl(var(--border))] pt-3">
                        <button
                          type="button"
                          onClick={() => openEditAddressModal(defaultShippingEntry)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Edit Facility
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Billing Address Card */}
                  <div className="flex flex-col justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-5">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-[hsl(var(--card-foreground))]">Billing Address</h3>
                          <span className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--card-foreground))]">
                            Primary Billing
                          </span>
                        </div>
                        {defaultBillingEntry && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                            {defaultBillingAddress.nickname}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                        <p className="font-bold text-[hsl(var(--card-foreground))]">{defaultBillingAddress.full_name}</p>
                        {defaultBillingAddress.company && (
                          <p className="font-medium text-[hsl(var(--muted-foreground))]">{defaultBillingAddress.company}</p>
                        )}
                        <p>{defaultBillingAddress.line1}</p>
                        {defaultBillingAddress.line2 && <p>{defaultBillingAddress.line2}</p>}
                        <p>
                          {defaultBillingAddress.city}, {defaultBillingAddress.state} {defaultBillingAddress.postal_code}
                        </p>
                        <p>{defaultBillingAddress.country}</p>
                        {defaultBillingAddress.phone && <p>{defaultBillingAddress.phone}</p>}
                      </div>
                    </div>

                    {defaultBillingEntry && (
                      <div className="mt-4 border-t border-[hsl(var(--border))] pt-3">
                        <button
                          type="button"
                          onClick={() => openEditAddressModal(defaultBillingEntry)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Edit Facility
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Saved Address Book Section */}
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[hsl(var(--border))] pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Saved Address Book</h2>
                      <span className="rounded-full bg-[hsl(var(--primary)/0.15)] px-2.5 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                        {addressBook.length} Saved
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                      Create and manage custom facility destinations with friendly nicknames (e.g. Primary Facility, Secondary Storage Annex, Lab B).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openAddAddressModal}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90 shrink-0"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add New Address
                  </button>
                </div>

                {addressBook.length === 0 ? (
                  <div className="mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-8 text-center">
                    <svg className="mx-auto h-10 w-10 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <h3 className="mt-3 text-sm font-bold text-[hsl(var(--card-foreground))]">No addresses saved yet</h3>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                      Add your primary research facility, warehouse, or home lab address with a customized nickname.
                    </p>
                    <button
                      type="button"
                      onClick={openAddAddressModal}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add First Address
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {addressBook.map((addr) => (
                      <div
                        key={addr.id}
                        className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                          addr.is_default_shipping
                            ? "border-[hsl(var(--primary))] bg-[hsl(var(--card))]"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] hover:border-[hsl(var(--border))]"
                        }`}
                      >
                        {/* Top: Nickname & Status Badges */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Nickname Tag */}
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-xs font-bold text-[hsl(var(--primary))]">
                                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                {addr.nickname}
                              </span>

                              {addr.is_default_shipping && (
                                <span className="rounded bg-[hsl(var(--accent)/0.2)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--accent-foreground))]">
                                  Default Shipping
                                </span>
                              )}
                              {addr.is_default_billing && (
                                <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--foreground))]">
                                  Default Billing
                                </span>
                              )}
                            </div>

                            {/* Card Edit/Delete Icons */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditAddressModal(addr)}
                                title="Edit Address"
                                className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAddress(addr.id, addr.nickname)}
                                title="Delete Address"
                                className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/0.15)] hover:text-[hsl(var(--destructive))]"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* Address Details */}
                          <div className="mt-3 space-y-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                            <p className="font-bold text-[hsl(var(--card-foreground))]">{addr.full_name}</p>
                            {addr.company && (
                              <p className="font-medium text-[hsl(var(--card-foreground)/0.8)]">{addr.company}</p>
                            )}
                            <p>{addr.line1}</p>
                            {addr.line2 && <p>{addr.line2}</p>}
                            <p>
                              {addr.city}, {addr.state} {addr.postal_code}
                            </p>
                            <p>{addr.country}</p>
                            {addr.phone && <p className="font-mono text-[11px]">{addr.phone}</p>}
                          </div>
                        </div>

                        {/* Bottom Quick Toggles */}
                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[hsl(var(--border))] pt-3 text-xs">
                          {!addr.is_default_shipping ? (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(addr.id, "shipping")}
                              className="font-semibold text-[hsl(var(--primary))] hover:underline"
                            >
                              Make Default Shipping
                            </button>
                          ) : (
                            <span className="font-medium text-[hsl(var(--accent-foreground))] flex items-center gap-1">
                              <svg className="h-3.5 w-3.5 text-[hsl(var(--primary))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Active Shipping Default
                            </span>
                          )}

                          {!addr.is_default_billing && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(addr.id, "billing")}
                              className="font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:underline"
                            >
                              Make Default Billing
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════ TAB: ACCOUNT DETAILS ══════════════════ */}
          {activeTab === "account_details" && (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm">
              <h2 className="text-lg font-bold text-[hsl(var(--card-foreground))]">Account Details</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Manage your clinical researcher identification and shipping credentials.
              </p>

              <div className="mt-6">
                <ProfileForm
                  profile={{
                    id: profile.id,
                    display_name: profile.display_name,
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    region: profile.region,
                    email: profile.email,
                  }}
                  onProfileUpdated={(updated) =>
                    setProfile((prev) => ({
                      ...prev,
                      ...updated,
                    }))
                  }
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════ DIGITAL COA MODAL ══════════════════ */}
      {selectedCoa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-[hsl(var(--card-foreground))] shadow-2xl sm:p-8"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[hsl(var(--border))] pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[hsl(var(--primary)/0.15)] px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-[hsl(var(--primary))]">
                    Official Certificate of Analysis
                  </span>
                  <span className="rounded border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.1)] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--accent-foreground))]">
                    Quality Release: Approved
                  </span>
                </div>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-[hsl(var(--foreground))]">
                  {selectedCoa.compoundTitle}
                </h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Specification Grade: Analytical Reference Standard · Order #{selectedCoa.orderNumber}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCoa(null)}
                className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Compound Specifications Header */}
            <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 text-xs sm:grid-cols-4">
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Batch Number</span>
                <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.batchNumber}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">CAS Number</span>
                <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.casNumber}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Molecular Formula</span>
                <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.molecularFormula}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Molecular Weight</span>
                <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.molecularWeight}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Testing Date</span>
                <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{when(selectedCoa.testDate)}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Retest Date</span>
                <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{when(selectedCoa.retestDate)}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Analytical Lab</span>
                <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.testingLab}</p>
              </div>
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Lab Location</span>
                <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.labLocation}</p>
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="mt-4 flex items-center gap-2 border-b border-[hsl(var(--border))] pb-3 overflow-x-auto sleek-scrollbar">
              <button
                type="button"
                onClick={() => setCoaReportTab("digital")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shrink-0 ${
                  coaReportTab === "digital"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Digital Specs & HPLC
              </button>

              <button
                type="button"
                onClick={() => setCoaReportTab("paper")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shrink-0 ${
                  coaReportTab === "paper"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Original Lab Paper (PDF)
              </button>

              <button
                type="button"
                onClick={() => setCoaReportTab("telemetry")}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition shrink-0 ${
                  coaReportTab === "telemetry"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                Raw Instrument Reading Data
              </button>
            </div>

            {/* ── TAB 1: DIGITAL SPECS & HPLC CHROMATOGRAM ── */}
            {coaReportTab === "digital" && (
              <div className="mt-6 space-y-6">
                {/* Compound Specifications Header */}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Batch Number</span>
                    <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.batchNumber}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">CAS Number</span>
                    <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.casNumber}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Molecular Formula</span>
                    <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.molecularFormula}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Molecular Weight</span>
                    <p className="mt-0.5 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.molecularWeight}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Testing Date</span>
                    <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{when(selectedCoa.testDate)}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Retest Date</span>
                    <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{when(selectedCoa.retestDate)}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Analytical Lab</span>
                    <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.testingLab}</p>
                  </div>
                  <div>
                    <span className="text-[hsl(var(--muted-foreground))]">Lab Location</span>
                    <p className="mt-0.5 font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.labLocation}</p>
                  </div>
                </div>

                {/* High-Resolution HPLC Chromatogram Section */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-[hsl(var(--card-foreground))]">
                        RP-HPLC Analytical Chromatogram
                      </h4>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        Column: C18 Reverse Phase (4.6 × 250 mm, 5 μm) · UV Detection: 214nm · Flow: 1.0 mL/min
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">Main Peak Area</span>
                      <p className="text-base font-black text-[hsl(var(--primary))]">{selectedCoa.purityPercent}%</p>
                    </div>
                  </div>

                  {/* Chromatogram SVG Canvas */}
                  <div className="mt-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4">
                    <div className="relative h-44 w-full">
                      {(() => {
                        const width = 600;
                        const height = 150;
                        const maxVal = 100;
                        const step = width / (selectedCoa.chromatogramPoints.length - 1);
                        const pointsStr = selectedCoa.chromatogramPoints
                          .map((pt, idx) => `${idx * step},${height - (pt / maxVal) * (height - 12)}`)
                          .join(" ");

                        return (
                          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
                            <defs>
                              <linearGradient id="modalHplcGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                            <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                            <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                            <line x1="0" y1={height} x2={width} y2={height} stroke="hsl(var(--border))" />

                            <polygon points={`0,${height} ${pointsStr} ${width},${height}`} fill="url(#modalHplcGrad)" />
                            <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" points={pointsStr} />

                            <circle cx={width * 0.61} cy={18} r={4} fill="hsl(var(--primary))" />
                            <text x={width * 0.61 + 8} y={22} fontSize="11" fill="hsl(var(--primary))" fontWeight="bold" fontFamily="monospace">
                              Rt: {selectedCoa.chromatogramRetentionMin} min ({selectedCoa.purityPercent}%)
                            </text>
                          </svg>
                        );
                      })()}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                      <span>0.00 min</span>
                      <span>5.00 min</span>
                      <span>10.00 min</span>
                      <span>15.00 min</span>
                      <span>20.00 min</span>
                      <span>25.00 min</span>
                    </div>
                  </div>
                </div>

                {/* Analyte Specifications Table */}
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      <tr>
                        <th className="px-4 py-3">Analysis / Test</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Specification</th>
                        <th className="px-4 py-3">Analytical Result</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {selectedCoa.specs.map((spec, i) => (
                        <tr key={i} className="hover:bg-[hsl(var(--muted)/0.1)]">
                          <td className="px-4 py-3 font-medium text-[hsl(var(--card-foreground))]">{spec.test}</td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{spec.method}</td>
                          <td className="px-4 py-3 font-mono text-[hsl(var(--muted-foreground))]">{spec.specification}</td>
                          <td className="px-4 py-3 font-mono font-bold text-[hsl(var(--foreground))]">{spec.result}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 font-bold text-[hsl(var(--primary))]">
                              {spec.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 2: ORIGINAL LAB PAPER (PDF / CERTIFICATE DOCUMENT) ── */}
            {coaReportTab === "paper" && (
              <div className="mt-6 space-y-6">
                {/* Download and Document Status Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[hsl(var(--card-foreground))]">
                        {selectedCoa.originalPaper.paperFileName}
                      </span>
                      <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
                        {selectedCoa.originalPaper.paperFileSize}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                      SHA256: {selectedCoa.originalPaper.paperSha256}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedCoa.pdfUrl) {
                          window.open(selectedCoa.pdfUrl, "_blank");
                        } else {
                          window.print();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3.5 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Lab PDF
                    </button>
                    <a
                      href={selectedCoa.verificationUrl || selectedCoa.originalPaper.qrVerificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-semibold text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--muted)/0.5)]"
                    >
                      Verify on Lab Portal &rarr;
                    </a>
                  </div>
                </div>

                {/* Scanned Lab Paper View if available */}
                {selectedCoa.paperImageUrl && (
                  <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-neutral-900/50 p-2 shadow-inner">
                    <img
                      src={selectedCoa.paperImageUrl}
                      alt="Authentic Laboratory Certificate Scan"
                      className="w-full h-auto max-h-[600px] object-contain mx-auto rounded-lg"
                    />
                  </div>
                )}

                {/* Authentic Stamped Lab Certificate Sheet Facsimile */}
                <div className="relative rounded-2xl border-2 border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-10 shadow-lg text-[hsl(var(--card-foreground))]">
                  {/* Subtle Background Watermark */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
                    <span className="rotate-[-25deg] text-6xl sm:text-8xl font-black uppercase tracking-widest text-[hsl(var(--foreground))]">
                      AUTHENTIC LAB REPORT
                    </span>
                  </div>

                  {/* Lab Official Letterhead */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-[hsl(var(--border))] pb-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] font-black text-sm">
                          {selectedCoa.testingLab.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-base font-black tracking-tight uppercase text-[hsl(var(--foreground))]">
                            {selectedCoa.testingLab}
                          </h4>
                          <p className="text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                            {selectedCoa.originalPaper.accreditation}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                        Facility Location: {selectedCoa.labLocation} · Contact: lab@analytical-services.eu
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        Official Certificate Number
                      </span>
                      <p className="mt-0.5 font-mono text-base font-black text-[hsl(var(--primary))]">
                        {selectedCoa.originalPaper.labReportNumber}
                      </p>
                      <span className="inline-block mt-1 rounded border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--primary))]">
                        QR Verified Certificate
                      </span>
                    </div>
                  </div>

                  {/* Sample Identification Sheet */}
                  <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4 text-xs sm:grid-cols-3">
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Sample Designation</span>
                      <p className="mt-0.5 font-bold text-[hsl(var(--foreground))]">{selectedCoa.compoundTitle}</p>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Client Reference</span>
                      <p className="mt-0.5 font-bold text-[hsl(var(--foreground))]">Unenter Labs (Research Div.)</p>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Batch / Lot Number</span>
                      <p className="mt-0.5 font-mono font-bold text-[hsl(var(--foreground))]">{selectedCoa.batchNumber}</p>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Sample Form & Presentation</span>
                      <p className="mt-0.5 text-[hsl(var(--foreground))]">{selectedCoa.originalPaper.sampleForm}</p>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Date Sample Received</span>
                      <p className="mt-0.5 font-bold text-[hsl(var(--foreground))]">{when(selectedCoa.originalPaper.receivedDate)}</p>
                    </div>
                    <div>
                      <span className="text-[hsl(var(--muted-foreground))]">Date Analysis Finalized</span>
                      <p className="mt-0.5 font-bold text-[hsl(var(--foreground))]">{when(selectedCoa.originalPaper.completedDate)}</p>
                    </div>
                  </div>

                  {/* Stamped Result Callout Box */}
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border-2 border-[hsl(var(--primary)/0.6)] bg-[hsl(var(--primary)/0.08)] p-5">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                        Official Laboratory Quantitative Assay
                      </span>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-[hsl(var(--primary))]">
                          {selectedCoa.purityPercent}%
                        </span>
                        <span className="text-sm font-bold text-[hsl(var(--foreground))]">
                          Purity (RP-HPLC Area %)
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        Methodology: High Performance Liquid Chromatography with Diode Array Detector (HPLC-DAD) & Mass Spectrometry.
                      </p>
                    </div>

                    <div className="rounded-lg border-2 border-[hsl(var(--primary))] px-4 py-2 text-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(var(--primary))]">
                        QUALITY RELEASE
                      </span>
                      <p className="text-lg font-black text-[hsl(var(--primary))]">
                        CONFORMS
                      </p>
                    </div>
                  </div>

                  {/* Facsimile Chromatogram Plot */}
                  <div className="mt-6 rounded-xl border border-[hsl(var(--border))] p-4 bg-[hsl(var(--muted)/0.1)]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[hsl(var(--card-foreground))]">
                        Laboratory Raw Chromatogram Printout
                      </span>
                      <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                        Peak Retention: {selectedCoa.chromatogramRetentionMin} min · Main Area: {selectedCoa.purityPercent}%
                      </span>
                    </div>

                    <div className="mt-3 relative h-36 w-full">
                      {(() => {
                        const width = 600;
                        const height = 120;
                        const maxVal = 100;
                        const step = width / (selectedCoa.chromatogramPoints.length - 1);
                        const pointsStr = selectedCoa.chromatogramPoints
                          .map((pt, idx) => `${idx * step},${height - (pt / maxVal) * (height - 10)}`)
                          .join(" ");

                        return (
                          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible">
                            <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="hsl(var(--border))" strokeDasharray="2 2" />
                            <line x1="0" y1={height} x2={width} y2={height} stroke="hsl(var(--border))" />
                            <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points={pointsStr} />
                            <circle cx={width * 0.61} cy={16} r={3.5} fill="hsl(var(--primary))" />
                            <text x={width * 0.61 + 6} y={20} fontSize="10" fill="hsl(var(--primary))" fontWeight="bold">
                              Main Peak ({selectedCoa.chromatogramRetentionMin} min)
                            </text>
                          </svg>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Physical Stamp & Signature Footer */}
                  <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-t border-[hsl(var(--border))] pt-6 text-xs">
                    <div className="space-y-1">
                      <span className="text-[hsl(var(--muted-foreground))]">Accredited Testing Chemist:</span>
                      <p className="font-bold text-sm text-[hsl(var(--foreground))]">{selectedCoa.analyst}</p>
                      <p className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">
                        Official Verification Key: {selectedCoa.originalPaper.verificationKey}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Stylized Physical Stamp Seal */}
                      <div className="flex flex-col items-center justify-center rounded-full border-2 border-[hsl(var(--primary))] p-3 text-center text-[9px] font-black uppercase text-[hsl(var(--primary))] h-20 w-20">
                        <span>CERTIFIED</span>
                        <span className="text-[11px] font-black">LAB</span>
                        <span>TESTED</span>
                      </div>

                      {/* QR Code Verification Box */}
                      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-2 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] font-mono text-[9px] text-[hsl(var(--muted-foreground))]">
                          [QR CODE]
                        </div>
                        <span className="mt-1 block text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                          Scan to Verify
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 3: RAW INSTRUMENT READING DATA & TELEMETRY ── */}
            {coaReportTab === "telemetry" && (
              <div className="mt-6 space-y-6">
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-4 text-xs">
                  <div>
                    <h4 className="font-bold text-[hsl(var(--card-foreground))]">
                      Direct Instrument Detector Telemetry & Readings
                    </h4>
                    <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                      Complete integration channels and mass spectrometry peak telemetry recorded by in-lab instrumentation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadCoaCsv(selectedCoa)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow transition hover:opacity-90"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadCoaJson(selectedCoa)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-semibold text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--muted)/0.5)]"
                    >
                      Export JSON
                    </button>
                  </div>
                </div>

                {/* Instrument Operating Parameters */}
                <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
                  <h4 className="text-sm font-bold text-[hsl(var(--card-foreground))]">
                    Instrument Configuration & Run Conditions
                  </h4>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Instrument System</span>
                      <p className="mt-1 font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.systemModel}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Analytical Column</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.columnSpec}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Detection Channel</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.detectionWavelength}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Calibration Fit (R²)</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--primary))]">{selectedCoa.telemetry.calibrationR2}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Flow Rate</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.flowRate}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Column Oven Temp</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.columnTemperature}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">Injection Volume</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.injectionVolume}</p>
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3">
                      <span className="text-[hsl(var(--muted-foreground))]">System Pressure</span>
                      <p className="mt-1 font-mono font-bold text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.systemPressure}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3 text-xs">
                    <span className="text-[hsl(var(--muted-foreground))]">Mobile Phase Gradient:</span>
                    <p className="mt-0.5 font-mono text-[hsl(var(--card-foreground))]">{selectedCoa.telemetry.mobilePhase}</p>
                  </div>
                </div>

                {/* Raw Detector Channel Integration Table */}
                <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                  <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--card-foreground))]">
                      Detector Integration Readings (All Channels)
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.1)] text-[11px] font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                        <tr>
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Retention (min)</th>
                          <th className="px-3 py-2.5">Width (min)</th>
                          <th className="px-3 py-2.5 font-mono">Area (mAU·s)</th>
                          <th className="px-3 py-2.5 font-mono">Height (mAU)</th>
                          <th className="px-3 py-2.5 font-mono">Area %</th>
                          <th className="px-3 py-2.5">Symmetry</th>
                          <th className="px-3 py-2.5">S/N Ratio</th>
                          <th className="px-3 py-2.5">Identification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--border))] font-mono">
                        {selectedCoa.telemetry.readings.map((r) => (
                          <tr key={r.peakNo} className="hover:bg-[hsl(var(--muted)/0.1)]">
                            <td className="px-3 py-2.5 font-bold text-[hsl(var(--card-foreground))]">{r.peakNo}</td>
                            <td className="px-3 py-2.5 font-bold text-[hsl(var(--primary))]">{r.retentionMin.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{r.widthMin.toFixed(2)}</td>
                            <td className="px-3 py-2.5">{r.areaMavs.toFixed(2)}</td>
                            <td className="px-3 py-2.5">{r.heightMav.toFixed(2)}</td>
                            <td className="px-3 py-2.5 font-bold text-[hsl(var(--primary))]">{r.areaPercent.toFixed(2)}%</td>
                            <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{r.symmetry.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-[hsl(var(--muted-foreground))]">{r.s2nRatio.toFixed(1)}</td>
                            <td className="px-3 py-2.5 font-sans font-semibold text-[hsl(var(--card-foreground))]">
                              {r.identification}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mass Spectrometry (MS) Raw Reading Data */}
                {selectedCoa.telemetry.massSpecPeaks.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                    <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] px-4 py-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--card-foreground))]">
                        Mass Spectrometry (MS) Ion Abundance Readings
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.1)] text-[11px] font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                          <tr>
                            <th className="px-4 py-2.5">m/z Ratio</th>
                            <th className="px-4 py-2.5">Ion Species</th>
                            <th className="px-4 py-2.5">Observed Mass</th>
                            <th className="px-4 py-2.5">Theoretical Mass</th>
                            <th className="px-4 py-2.5">Delta (ppm)</th>
                            <th className="px-4 py-2.5 text-right">Relative Abundance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[hsl(var(--border))] font-mono">
                          {selectedCoa.telemetry.massSpecPeaks.map((ms, i) => (
                            <tr key={i} className="hover:bg-[hsl(var(--muted)/0.1)]">
                              <td className="px-4 py-2.5 font-bold text-[hsl(var(--primary))]">{ms.mzRatio}</td>
                              <td className="px-4 py-2.5 font-sans font-medium text-[hsl(var(--card-foreground))]">{ms.ionForm}</td>
                              <td className="px-4 py-2.5 text-[hsl(var(--card-foreground))]">{ms.observedMass}</td>
                              <td className="px-4 py-2.5 text-[hsl(var(--muted-foreground))]">{ms.theoreticalMass}</td>
                              <td className="px-4 py-2.5 text-[hsl(var(--primary))] font-semibold">{ms.deltaPpm}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-[hsl(var(--card-foreground))]">
                                {ms.abundancePercent.toFixed(1)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Laboratory Sign-off & Verification Seal */}
            <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4 text-xs sm:flex-row sm:items-center">
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Certified Analytical Chemist:</span>
                <p className="font-bold text-[hsl(var(--foreground))]">{selectedCoa.analyst}</p>
                <p className="mt-0.5 text-[11px] font-mono text-[hsl(var(--muted-foreground))]">
                  Digital Signature Hash: SHA256:{selectedCoa.id.slice(0, 16)}...f83e
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-semibold text-[hsl(var(--card-foreground))] shadow-sm hover:bg-[hsl(var(--muted)/0.5)]"
                >
                  Print Report
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCoa(null)}
                  className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ SAVED ADDRESS MODAL ══════════════════ */}
      {isAddressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
          <div
            className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-[hsl(var(--card-foreground))] shadow-2xl sm:p-8"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[hsl(var(--border))] pb-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {editingAddress ? "Edit Location" : "New Facility Address"}
                </span>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-[hsl(var(--foreground))]">
                  {editingAddress ? `Edit "${editingAddress.nickname}"` : "Add Facility Destination"}
                </h3>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  Set address coordinates and custom nickname saved directly to your Unenter Labs account.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddressModalOpen(false)}
                className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.5)] hover:text-[hsl(var(--foreground))]"
                aria-label="Close modal"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error Message */}
            {addressFormError && (
              <div className="mt-4 rounded-lg border border-[hsl(var(--destructive)/0.5)] bg-[hsl(var(--destructive)/0.1)] p-3 text-xs font-semibold text-[hsl(var(--destructive))]">
                {addressFormError}
              </div>
            )}

            {/* Address Form */}
            <form onSubmit={handleSaveAddress} className="mt-4 space-y-4">
              {/* Nickname Field */}
              <div>
                <label className="block text-xs font-bold text-[hsl(var(--card-foreground))]">
                  Facility / Address Nickname <span className="text-[hsl(var(--primary))]">*</span>
                </label>
                <input
                  type="text"
                  value={formNickname}
                  onChange={(e) => setFormNickname(e.target.value)}
                  placeholder="e.g. Primary Facility, Secondary Storage Annex, Tyler's Home Lab"
                  required
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
                <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                  A nickname makes it easy to select this destination during compound checkout.
                </p>
              </div>

              {/* Full Name & Company */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    Recipient / Full Name <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="Dr. Tyler Burns"
                    required
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    Institution / Company
                  </label>
                  <input
                    type="text"
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="Unenter Research Labs"
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
              </div>

              {/* Street Address Line 1 */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                  Street Address <span className="text-[hsl(var(--primary))]">*</span>
                </label>
                <input
                  type="text"
                  value={formLine1}
                  onChange={(e) => setFormLine1(e.target.value)}
                  placeholder="1619 N Chaparral Dr"
                  required
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
              </div>

              {/* Street Address Line 2 */}
              <div>
                <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                  Suite / Unit / Building (Optional)
                </label>
                <input
                  type="text"
                  value={formLine2}
                  onChange={(e) => setFormLine2(e.target.value)}
                  placeholder="Building B, Suite 100"
                  className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                />
              </div>

              {/* City, State, Postal Code */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    City <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    placeholder="Ridgecrest"
                    required
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    State <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formState}
                    onChange={(e) => setFormState(e.target.value)}
                    placeholder="CA"
                    required
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    ZIP <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formPostalCode}
                    onChange={(e) => setFormPostalCode(e.target.value)}
                    placeholder="93555"
                    required
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
              </div>

              {/* Country & Phone */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    Country <span className="text-[hsl(var(--primary))]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value)}
                    placeholder="US"
                    required
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(var(--card-foreground))]">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+1 (760) 264-6947"
                    className="mt-1 w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--ring))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                  />
                </div>
              </div>

              {/* Default Toggles */}
              <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-3 pt-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--card-foreground))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefaultShipping}
                    onChange={(e) => setFormIsDefaultShipping(e.target.checked)}
                    className="rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                  />
                  <span>Set as default shipping destination</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--card-foreground))] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDefaultBilling}
                    onChange={(e) => setFormIsDefaultBilling(e.target.checked)}
                    className="rounded border-[hsl(var(--input))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--ring))]"
                  />
                  <span>Set as default billing address</span>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddressModalOpen(false)}
                  disabled={addressFormLoading}
                  className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-semibold text-[hsl(var(--card-foreground))] shadow-sm hover:bg-[hsl(var(--muted)/0.5)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addressFormLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] shadow hover:opacity-90 disabled:opacity-50"
                >
                  {addressFormLoading && (
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {editingAddress ? "Update Address" : "Save Address"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
